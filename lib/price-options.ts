import "server-only";
import { randomUUID } from "node:crypto";
import { assertDurableStorage, ensureSchema, getSql, isDbConfigured } from "./db";
import { copyMemPrices, forgetMemPrices } from "./prices";
import { BASE_ID, SEED_OPTIONS, type PriceOption } from "./options";

/**
 * Revendeurs (nom, ville, écart) : Postgres si DATABASE_URL est défini, mémoire sinon (démo locale).
 * « Revendeur » (BASE_ID) est la base : toujours présente, en tête, ni renommée ni supprimée.
 */
const g = globalThis as unknown as { __memOptions?: PriceOption[] };
const mem = () => (g.__memOptions ??= SEED_OPTIONS.map((o) => ({ ...o })));

/** La base d'abord, puis l'ordre choisi dans la gestion. */
const baseFirst = (list: PriceOption[]) => [...list.filter((o) => o.id === BASE_ID), ...list.filter((o) => o.id !== BASE_ID)];

export async function getOptions(): Promise<PriceOption[]> {
  if (!isDbConfigured()) return baseFirst(mem().map((o) => ({ ...o })));
  await ensureSchema();
  const rows = await getSql()`
    select id, name, city, price_offset, is_default from price_options order by position, created_at`;
  return baseFirst(
    rows.map((r) => ({
      id: r.id as string,
      name: r.name as string,
      city: (r.city as string | null) || null,
      offset: Number(r.price_offset),
      isDefault: Boolean(r.is_default),
    })),
  );
}

/**
 * Nouveau revendeur : il part des prix saisis de la base (copiés ; modifiables ensuite sans toucher à la base)
 * et de l'écart indiqué (par défaut celui de la base).
 */
export async function createOption(name: string, city: string | null, offset: number): Promise<PriceOption[]> {
  assertDurableStorage();
  const id = randomUUID().slice(0, 8);
  if (!isDbConfigured()) {
    mem().push({ id, name, city, offset, isDefault: false });
    copyMemPrices(BASE_ID, id);
    return getOptions();
  }
  await ensureSchema();
  await getSql().begin(async (tx) => {
    await tx`
      insert into price_options (id, name, city, price_offset, position)
      values (${id}, ${name}, ${city}, ${offset}, (select coalesce(max(position), -1) + 1 from price_options))`;
    await tx`
      insert into option_prices (option_id, variant_id, sku, label, price)
      select ${id}, variant_id, sku, label, price from option_prices where option_id = ${BASE_ID}`;
  });
  return getOptions();
}

/** Modifier un revendeur. La base ne change que d'écart (pas de nom ni de ville). */
export async function updateOption(
  id: string,
  patch: { name?: string; city?: string | null; offset?: number },
): Promise<PriceOption[]> {
  assertDurableStorage();
  const p = id === BASE_ID ? { offset: patch.offset } : patch;
  if (!isDbConfigured()) {
    const o = mem().find((x) => x.id === id);
    if (o) {
      if (p.name !== undefined) o.name = p.name;
      if (p.city !== undefined) o.city = p.city;
      if (p.offset !== undefined) o.offset = p.offset;
    }
    return getOptions();
  }
  await ensureSchema();
  await getSql().begin(async (tx) => {
    if (p.name !== undefined) await tx`update price_options set name = ${p.name} where id = ${id}`;
    if (p.city !== undefined) await tx`update price_options set city = ${p.city} where id = ${id}`;
    if (p.offset !== undefined) await tx`update price_options set price_offset = ${p.offset} where id = ${id}`;
  });
  return getOptions();
}

/** Supprime un revendeur et ses prix saisis (ses factures restent). La base ne se supprime pas. */
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
