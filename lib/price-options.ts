import "server-only";
import { randomUUID } from "node:crypto";
import { assertDurableStorage, ensureSchema, getSql, isDbConfigured } from "./db";
import { forgetMemPrices } from "./prices";
import { BASE_ID, SEED_OPTIONS, type PriceOption, type PriceSource } from "./options";

/**
 * Revendeurs (nom, ville ; prix par produit dans prices.ts) : Postgres si DATABASE_URL est défini, mémoire sinon.
 * « Prix Gros » (BASE_ID) est la base : toujours présente, en tête, ni renommée ni supprimée.
 */
const g = globalThis as unknown as { __memOptions?: PriceOption[] };
const mem = () => (g.__memOptions ??= SEED_OPTIONS.map((o) => ({ ...o })));

/** La base d'abord, puis l'ordre choisi dans la gestion. */
const baseFirst = (list: PriceOption[]) => [...list.filter((o) => o.id === BASE_ID), ...list.filter((o) => o.id !== BASE_ID)];

export async function getOptions(): Promise<PriceOption[]> {
  if (!isDbConfigured()) return baseFirst(mem().map((o) => ({ ...o })));
  await ensureSchema();
  const rows = await getSql()`
    select id, name, city, phone, price_offset, is_default, source from price_options order by position, created_at`;
  return baseFirst(
    rows.map((r) => ({
      id: r.id as string,
      name: r.name as string,
      city: (r.city as string | null) || null,
      phone: (r.phone as string | null) || null,
      offset: Number(r.price_offset),
      isDefault: Boolean(r.is_default),
      source: r.source === "site" ? ("site" as const) : ("base" as const),
    })),
  );
}

/**
 * Nouveau revendeur, sans prix saisi : il suit son modèle (« Prix Gros », ou le prix du site), produit par
 * produit, jusqu'à ce qu'un prix soit saisi pour lui.
 */
export async function createOption(
  name: string,
  city: string | null,
  source: PriceSource,
  phone: string | null = null,
): Promise<PriceOption[]> {
  const offset = 0;
  assertDurableStorage();
  const id = randomUUID().slice(0, 8);
  if (!isDbConfigured()) {
    mem().push({ id, name, city, phone, offset, isDefault: false, source });
    return getOptions();
  }
  await ensureSchema();
  await getSql()`
    insert into price_options (id, name, city, phone, price_offset, position, source)
    values (${id}, ${name}, ${city}, ${phone}, ${offset}, (select coalesce(max(position), -1) + 1 from price_options), ${source})`;
  return getOptions();
}

/**
 * Modifier un revendeur (nom, ville, modèle suivi). La base garde son nom et n'a pas de ville. `offset` ne sert
 * plus qu'à remettre l'ancien écart à 0 une fois figé (lib/price-freeze.ts).
 */
export async function updateOption(
  id: string,
  patch: { name?: string; city?: string | null; phone?: string | null; offset?: number; source?: PriceSource },
): Promise<PriceOption[]> {
  assertDurableStorage();
  const p = id === BASE_ID ? { offset: patch.offset } : patch;
  if (!isDbConfigured()) {
    const o = mem().find((x) => x.id === id);
    if (o) {
      if (p.name !== undefined) o.name = p.name;
      if (p.city !== undefined) o.city = p.city;
      if (p.phone !== undefined) o.phone = p.phone;
      if (p.offset !== undefined) o.offset = p.offset;
      if (p.source !== undefined) o.source = p.source;
    }
    return getOptions();
  }
  await ensureSchema();
  await getSql().begin(async (tx) => {
    if (p.name !== undefined) await tx`update price_options set name = ${p.name} where id = ${id}`;
    if (p.city !== undefined) await tx`update price_options set city = ${p.city} where id = ${id}`;
    if (p.phone !== undefined) await tx`update price_options set phone = ${p.phone} where id = ${id}`;
    if (p.offset !== undefined) await tx`update price_options set price_offset = ${p.offset} where id = ${id}`;
    if (p.source !== undefined) await tx`update price_options set source = ${p.source} where id = ${id}`;
  });
  return getOptions();
}

/** Supprime un revendeur et ses prix saisis (ses devis restent). La base ne se supprime pas. */
export async function deleteOption(id: string): Promise<PriceOption[]> {
  assertDurableStorage();
  if (id === BASE_ID) return getOptions();
  if (!isDbConfigured()) {
    const list = mem();
    const i = list.findIndex((x) => x.id === id);
    if (i >= 0) {
      list.splice(i, 1);
      forgetMemPrices(id);
    }
    return getOptions();
  }
  await ensureSchema();
  await getSql().begin(async (tx) => {
    await tx`delete from option_prices where option_id = ${id}`;
    await tx`delete from price_options where id = ${id}`;
  });
  return getOptions();
}

/** Nouvel ordre des revendeurs (ids, base exclue) : tel qu'affiché dans les listes. */
export async function reorderOptions(ids: string[]): Promise<PriceOption[]> {
  assertDurableStorage();
  const order = ids.filter((id) => id !== BASE_ID);
  if (!isDbConfigured()) {
    const list = mem();
    const rank = new Map(order.map((id, i) => [id, i]));
    list.sort((a, b) => (a.id === BASE_ID ? -1 : b.id === BASE_ID ? 1 : (rank.get(a.id) ?? 1e9) - (rank.get(b.id) ?? 1e9)));
    return getOptions();
  }
  await ensureSchema();
  await getSql().begin(async (tx) => {
    for (const [i, id] of order.entries()) await tx`update price_options set position = ${i} where id = ${id}`;
  });
  return getOptions();
}
