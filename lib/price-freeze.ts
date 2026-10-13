import "server-only";
import { getCatalog } from "./catalog";
import { ensureSchema, getSql, isDbConfigured, storageDown } from "./db";
import { autoPrice } from "./options";
import { getOptions, updateOption } from "./price-options";
import { readSavedPrices, savePrices, type PriceUpdate } from "./prices";

/**
 * Passage de l'ancien « écart » (prix site + N DH, 0 = prix du site) à des prix par produit, une seule fois :
 * pour CHAQUE revendeur (écart nul compris), chaque produit sans prix saisi reçoit le prix que l'écart donnait
 * jusqu'ici (rien ne change pour l'utilisateur), puis l'écart est remis à 0. Fait une fois pour toutes
 * (marque « prices_frozen » en base) ; les prix déjà saisis ne sont jamais touchés.
 * Si le catalogue Shopify est injoignable, on réessaie au prochain appel.
 */
const FLAG = "prices_frozen";
const g = globalThis as unknown as { __pricesFrozen?: boolean };

async function flagSet(): Promise<boolean> {
  if (!isDbConfigured()) return false;
  await ensureSchema();
  const rows = await getSql()`select 1 from app_settings where key = ${FLAG}`;
  return rows.length > 0;
}

export async function ensureOffsetsFrozen(): Promise<void> {
  if (g.__pricesFrozen) return;
  if (storageDown()) return;
  if (await flagSet()) {
    g.__pricesFrozen = true;
    return;
  }

  let items;
  try {
    ({ items } = await getCatalog());
  } catch {
    return; // Shopify injoignable : on réessaiera
  }
  if (!items.length) return;
  const [options, saved] = await Promise.all([getOptions(), readSavedPrices()]);

  for (const option of options) {
    const mine = saved[option.id] ?? {};
    const missing: PriceUpdate[] = [];
    for (const it of items) {
      if (mine[it.id] != null) continue;
      const price = autoPrice(option, it.price);
      if (price == null) continue;
      missing.push({ variantId: it.id, price, sku: it.sku, label: it.variant ? `${it.title} — ${it.variant}` : it.title });
    }
    if (missing.length) {
      if (isDbConfigured()) {
        const sql = getSql();
        const rows = missing.map((u) => ({
          option_id: option.id,
          variant_id: u.variantId,
          sku: u.sku ?? null,
          label: u.label ?? null,
          price: u.price,
        }));
        // Une seule requête par revendeur ; un prix saisi entre-temps n'est pas écrasé.
        await sql`
          insert into option_prices ${sql(rows, "option_id", "variant_id", "sku", "label", "price")}
          on conflict (option_id, variant_id) do nothing`;
      } else {
        await savePrices(option.id, missing);
      }
    }
    if (option.offset !== 0) await updateOption(option.id, { offset: 0 });
  }

  if (isDbConfigured()) {
    await getSql()`
      insert into app_settings (key, value) values (${FLAG}, '1') on conflict (key) do nothing`;
  }
  g.__pricesFrozen = true;
}
