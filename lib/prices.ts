import "server-only";
import type { OptionPrices } from "./options";
import { DEMO_PRICES } from "./demo-data";
import { assertDurableStorage, ensureSchema, getSql, isDbConfigured, storageDown } from "./db";
import { isShopifyConfigured } from "./shopify";

/**
 * Stockage des prix commerciaux saisis à la main, par option (voir price-options.ts), derrière une interface
 * minimale (getPrices / savePrices) : on peut changer de backend sans toucher au reste.
 *  - Postgres si DATABASE_URL est défini (production) ;
 *  - mémoire sinon (démo locale, NON persistant).
 */
export type PriceUpdate = {
  variantId: string;
  /** null = supprimer le prix saisi (le produit n'a alors plus de prix revendeur). */
  price: number | null;
  sku?: string | null;
  label?: string | null;
};

export type SaveResult = { updated: number; deleted: number; unchanged: number };

/** postgres ; memory = démo locale ; down = production sans base (enregistrements refusés). */
export function storageMode(): "postgres" | "memory" | "down" {
  return isDbConfigured() ? "postgres" : storageDown() ? "down" : "memory";
}

// ── Mémoire (démo) ──────────────────────────────────────────────────
const g = globalThis as unknown as { __memPrices?: OptionPrices };
function mem(): OptionPrices {
  // En démo complète (pas de Shopify), on part des prix d'exemple (dans l'option C).
  return (g.__memPrices ??= isShopifyConfigured() ? {} : { c: { ...DEMO_PRICES } });
}

// ── API publique ────────────────────────────────────────────────────
/** Prix saisis de tous les revendeurs (après avoir figé, une seule fois, l'ancien écart en prix par produit). */
export async function getPrices(): Promise<OptionPrices> {
  // Import dynamique : price-freeze lit le catalogue et les revendeurs, qui dépendent de ce module.
  await (await import("./price-freeze")).ensureOffsetsFrozen();
  return readSavedPrices();
}

/** Prix saisis tels qu'enregistrés, sans autre traitement. */
export async function readSavedPrices(): Promise<OptionPrices> {
  if (!isDbConfigured()) {
    return Object.fromEntries(Object.entries(mem()).map(([id, m]) => [id, { ...m }]));
  }
  await ensureSchema();
  const rows = await getSql()`select option_id, variant_id, price from option_prices`;
  const out: OptionPrices = {};
  for (const r of rows) (out[r.option_id as string] ??= {})[r.variant_id as string] = Number(r.price);
  return out;
}

/** Copie les prix saisis d'une option vers une autre (nouveau revendeur créé depuis la base). */
export function copyMemPrices(from: string, to: string) {
  const m = mem();
  m[to] = { ...(m[from] ?? {}) };
}

/** Supprime les prix saisis d'une option (option supprimée). */
export function forgetMemPrices(option: string) {
  delete mem()[option];
}

export async function savePrices(option: string, updates: PriceUpdate[]): Promise<SaveResult> {
  assertDurableStorage();
  // Dernière valeur gagnante si un variant apparaît deux fois.
  const byId = new Map(updates.map((u) => [u.variantId, u]));
  const list = [...byId.values()];
  const result: SaveResult = { updated: 0, deleted: 0, unchanged: 0 };
  if (!list.length) return result;

  if (!isDbConfigured()) {
    const store = (mem()[option] ??= {});
    for (const u of list) {
      const old = store[u.variantId];
      if (u.price == null) {
        if (old == null) {
          result.unchanged++;
        } else {
          delete store[u.variantId];
          result.deleted++;
        }
      } else if (old === u.price) {
        result.unchanged++;
      } else {
        store[u.variantId] = u.price;
        result.updated++;
      }
    }
    return result;
  }

  await ensureSchema();
  await getSql().begin(async (tx) => {
    const ids = list.map((u) => u.variantId);
    const existing = await tx`
      select variant_id, price from option_prices where option_id = ${option} and variant_id in ${tx(ids)}`;
    const old = new Map(existing.map((r) => [r.variant_id as string, Number(r.price)]));

    // Trois requêtes en tout (au lieu de deux par ligne) : un import de 300 prix reste instantané.
    const upserts: {
      option_id: string;
      variant_id: string;
      sku: string | null;
      label: string | null;
      price: number;
    }[] = [];
    const removed: string[] = [];
    const history: { option_id: string; variant_id: string; old_price: number | null; new_price: number | null }[] = [];
    for (const u of list) {
      const before = old.get(u.variantId) ?? null;
      if (u.price == null) {
        if (before == null) {
          result.unchanged++;
          continue;
        }
        removed.push(u.variantId);
        history.push({ option_id: option, variant_id: u.variantId, old_price: before, new_price: null });
        result.deleted++;
      } else {
        if (before === u.price) {
          result.unchanged++;
          continue;
        }
        upserts.push({
          option_id: option,
          variant_id: u.variantId,
          sku: u.sku ?? null,
          label: u.label ?? null,
          price: u.price,
        });
        history.push({ option_id: option, variant_id: u.variantId, old_price: before, new_price: u.price });
        result.updated++;
      }
    }
    if (removed.length) {
      await tx`delete from option_prices where option_id = ${option} and variant_id in ${tx(removed)}`;
    }
    if (upserts.length) {
      await tx`
        insert into option_prices ${tx(upserts, "option_id", "variant_id", "sku", "label", "price")}
        on conflict (option_id, variant_id) do update
          set price = excluded.price,
              sku = coalesce(excluded.sku, option_prices.sku),
              label = coalesce(excluded.label, option_prices.label),
              updated_at = now()`;
    }
    if (history.length) {
      await tx`
        insert into commercial_price_history ${tx(history, "option_id", "variant_id", "old_price", "new_price")}`;
    }
  });
  return result;
}
