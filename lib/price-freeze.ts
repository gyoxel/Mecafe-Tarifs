import "server-only";
import { getCatalog } from "./catalog";
import { ensureSchema, getSql, isDbConfigured, storageDown } from "./db";
import { autoPrice, BASE_ID } from "./options";
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
    await ensureInheritance();
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
  await ensureInheritance();
}

/**
 * Passage aux revendeurs qui SUIVENT « Prix Gros », une seule fois (marque « prices_inherit ») : les prix
 * d'un revendeur identiques à ceux de « Prix Gros » (copiés à sa création, jamais changés) sont retirés ; ces
 * produits suivent désormais « Prix Gros ». Les prix qui en diffèrent (modifiés à la main) restent fixes.
 */
const INHERIT_FLAG = "prices_inherit";
const gi = globalThis as unknown as { __pricesInherit?: boolean };

async function ensureInheritance(): Promise<void> {
  if (gi.__pricesInherit || !isDbConfigured()) return;
  const sql = getSql();
  await sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(727020)`;
    const [done] = await tx`select 1 from app_settings where key = ${INHERIT_FLAG}`;
    if (done) return;
    await tx`
      delete from option_prices o using option_prices b, price_options p
      where b.option_id = ${BASE_ID} and b.variant_id = o.variant_id and b.price = o.price
        and p.id = o.option_id and p.id <> ${BASE_ID} and p.source = 'base'`;
    await tx`insert into app_settings (key, value) values (${INHERIT_FLAG}, '1') on conflict (key) do nothing`;
  });
  gi.__pricesInherit = true;
}
