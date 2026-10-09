import "server-only";
import type { OptionPrices } from "./options";
import { DEMO_PRICES } from "./demo-data";
import { ensureSchema, getSql, isDbConfigured } from "./db";
import { isShopifyConfigured } from "./shopify";

/**
 * Stockage des prix commerciaux saisis à la main, par option (voir price-options.ts), derrière une interface
 * minimale (getPrices / savePrices) : on peut changer de backend sans toucher au reste.
 *  - Postgres si DATABASE_URL est défini (production) ;
 *  - mémoire sinon (démo locale, NON persistant).
 */
export type PriceUpdate = {
  variantId: string;
  /** null = supprimer le prix saisi (l'option revient alors au prix automatique). */
  price: number | null;
  sku?: string | null;
  label?: string | null;
};

export type SaveResult = { updated: number; deleted: number; unchanged: number };

export function storageMode(): "postgres" | "memory" {
  return isDbConfigured() ? "postgres" : "memory";
}

// ── Mémoire (démo) ──────────────────────────────────────────────────
const g = globalThis as unknown as { __memPrices?: OptionPrices };
function mem(): OptionPrices {
  // En démo complète (pas de Shopify), on part des prix d'exemple (dans l'option C).
  return (g.__memPrices ??= isShopifyConfigured() ? {} : { c: { ...DEMO_PRICES } });
}

// ── API publique ────────────────────────────────────────────────────
export async function getPrices(): Promise<OptionPrices> {
  if (!isDbConfigured()) {
    return Object.fromEntries(Object.entries(mem()).map(([id, m]) => [id, { ...m }]));
  }
  await ensureSchema();
  const rows = await getSql()`select option_id, variant_id, price from option_prices`;
  const out: OptionPrices = {};
  for (const r of rows) (out[r.option_id as string] ??= {})[r.variant_id as string] = Number(r.price);
  return out;
}

/** Supprime les prix saisis d'une option (option supprimée). */
export function forgetMemPrices(option: string) {
  delete mem()[option];
}

export async function savePrices(option: string, updates: PriceUpdate[]): Promise<SaveResult> {
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

    for (const u of list) {
      const before = old.get(u.variantId) ?? null;
      if (u.price == null) {
        if (before == null) {
          result.unchanged++;
          continue;
        }
        await tx`delete from option_prices where option_id = ${option} and variant_id = ${u.variantId}`;
        await tx`
          insert into commercial_price_history (option_id, variant_id, old_price, new_price)
          values (${option}, ${u.variantId}, ${before}, null)`;
        result.deleted++;
      } else {
        if (before === u.price) {
          result.unchanged++;
          continue;
        }
        await tx`
          insert into option_prices (option_id, variant_id, sku, label, price)
          values (${option}, ${u.variantId}, ${u.sku ?? null}, ${u.label ?? null}, ${u.price})
          on conflict (option_id, variant_id) do update
            set price = excluded.price,
                sku = coalesce(excluded.sku, option_prices.sku),
                label = coalesce(excluded.label, option_prices.label),
                updated_at = now()`;
        await tx`
          insert into commercial_price_history (option_id, variant_id, old_price, new_price)
          values (${option}, ${u.variantId}, ${before}, ${u.price})`;
        result.updated++;
      }
    }
  });
  return result;
}
