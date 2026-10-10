import "server-only";
import { randomUUID } from "node:crypto";
import { assertDurableStorage, ensureSchema, getSql, isDbConfigured } from "./db";
import { forgetMemPrices } from "./prices";
import { SEED_OPTIONS, type PriceOption } from "./options";

/**
 * Options de prix (nom + écart) : Postgres si DATABASE_URL est défini, mémoire sinon (démo).
 * Il reste toujours au moins une option, et exactement une option par défaut.
 */
const g = globalThis as unknown as { __memOptions?: PriceOption[] };
const mem = () => (g.__memOptions ??= SEED_OPTIONS.map((o) => ({ ...o })));

export async function getOptions(): Promise<PriceOption[]> {
  if (!isDbConfigured()) return mem().map((o) => ({ ...o }));
  await ensureSchema();
  const rows = await getSql()`
    select id, name, city, price_offset, is_default from price_options order by position, created_at`;
  return rows.map((r) => ({
    id: r.id as string,
    name: r.name as string,
    city: (r.city as string | null) || null,
    offset: Number(r.price_offset),
    isDefault: Boolean(r.is_default),
  }));
}

export async function createOption(name: string, city: string | null, offset: number): Promise<PriceOption[]> {
  assertDurableStorage();
  const id = randomUUID().slice(0, 8);
  if (!isDbConfigured()) {
    mem().push({ id, name, city, offset, isDefault: false });
    return getOptions();
  }
  await ensureSchema();
  await getSql()`
    insert into price_options (id, name, city, price_offset, position)
    values (${id}, ${name}, ${city}, ${offset}, (select coalesce(max(position), -1) + 1 from price_options))`;
  return getOptions();
}

export async function updateOption(
  id: string,
  patch: { name?: string; city?: string | null; offset?: number; isDefault?: true },
): Promise<PriceOption[]> {
  assertDurableStorage();
  if (!isDbConfigured()) {
    const list = mem();
    const o = list.find((x) => x.id === id);
    if (o) {
      if (patch.name !== undefined) o.name = patch.name;
      if (patch.city !== undefined) o.city = patch.city;
      if (patch.offset !== undefined) o.offset = patch.offset;
      if (patch.isDefault) for (const x of list) x.isDefault = x.id === id;
    }
    return getOptions();
  }
  await ensureSchema();
  await getSql().begin(async (tx) => {
    if (patch.name !== undefined) await tx`update price_options set name = ${patch.name} where id = ${id}`;
    if (patch.city !== undefined) await tx`update price_options set city = ${patch.city} where id = ${id}`;
    if (patch.offset !== undefined) await tx`update price_options set price_offset = ${patch.offset} where id = ${id}`;
    if (patch.isDefault) await tx`update price_options set is_default = (id = ${id})`;
  });
  return getOptions();
}

/** Supprime une option et ses prix saisis. Si c'était l'option par défaut, la première devient par défaut. */
export async function deleteOption(id: string): Promise<PriceOption[]> {
  assertDurableStorage();
  if (!isDbConfigured()) {
    const list = mem();
    const i = list.findIndex((x) => x.id === id);
    if (i >= 0 && list.length > 1) {
      const [gone] = list.splice(i, 1);
      if (gone.isDefault) list[0].isDefault = true;
      forgetMemPrices(id);
    }
    return getOptions();
  }
  await ensureSchema();
  await getSql().begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(727002)`;
    const [{ n }] = await tx`select count(*)::int as n from price_options`;
    if (n <= 1) return;
    await tx`delete from option_prices where option_id = ${id}`;
    await tx`delete from price_options where id = ${id}`;
    await tx`
      update price_options set is_default = true
      where id = (select id from price_options order by position, created_at limit 1)
        and not exists (select 1 from price_options where is_default)`;
  });
  return getOptions();
}
