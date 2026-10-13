import "server-only";
import { getCatalog } from "./catalog";
import { storageDown } from "./db";
import { autoPrice } from "./options";
import { getOptions, updateOption } from "./price-options";
import { readSavedPrices, savePrices, type PriceUpdate } from "./prices";

/**
 * Passage de l'ancien « écart » (prix site + N DH) à des prix par produit, une seule fois :
 * pour chaque revendeur qui a encore un écart, chaque produit sans prix saisi reçoit le prix que l'écart
 * donnait jusqu'ici (rien ne change pour l'utilisateur), puis l'écart est remis à 0.
 * Sans danger si deux instances le font en même temps (mêmes valeurs ; les prix déjà saisis ne sont pas touchés).
 * Si le catalogue Shopify est injoignable, on réessaie au prochain appel.
 */
const g = globalThis as unknown as { __offsetsFrozen?: boolean };

export async function ensureOffsetsFrozen(): Promise<void> {
  if (g.__offsetsFrozen) return;
  const pending = (await getOptions()).filter((o) => o.offset !== 0);
  if (!pending.length) {
    g.__offsetsFrozen = true;
    return;
  }
  if (storageDown()) return;

  let items;
  try {
    ({ items } = await getCatalog());
  } catch {
    return; // Shopify injoignable : on réessaiera
  }
  const saved = await readSavedPrices();
  for (const option of pending) {
    const mine = saved[option.id] ?? {};
    const updates: PriceUpdate[] = [];
    for (const it of items) {
      if (mine[it.id] != null) continue;
      const price = autoPrice(option, it.price);
      if (price == null) continue;
      updates.push({ variantId: it.id, price, sku: it.sku, label: it.variant ? `${it.title} — ${it.variant}` : it.title });
    }
    if (updates.length) await savePrices(option.id, updates);
    await updateOption(option.id, { offset: 0 });
  }
  g.__offsetsFrozen = true;
}
