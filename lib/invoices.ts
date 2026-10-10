import "server-only";
import { QTY_MAX } from "./cart";
import { getCatalog } from "./catalog";
import { assertDurableStorage, ensureSchema, getSql, isDbConfigured } from "./db";
import { sumRows, type Draft, type InvoiceRow, type SavedInvoice } from "./invoice-types";

export type { Draft };
import { lineTotal, sameMoney } from "./money";
import { pricesFor } from "./options";
import { getOptions } from "./price-options";
import { getPrices } from "./prices";
import { displayTitle, displayVariant } from "./title";

/**
 * Historique des factures confirmées : Postgres si DATABASE_URL est défini, mémoire sinon (démo).
 * Le n° est attribué à l'enregistrement : F{année}-{id sur 5 chiffres}, unique.
 */
const g = globalThis as unknown as { __memInvoices?: SavedInvoice[] };
const mem = () => (g.__memInvoices ??= []);

const numberOf = (id: number, d: Date) => `F${d.getFullYear()}-${String(id).padStart(5, "0")}`;

export const MAX_LINES = 500;

/**
 * Corps { commercialId, lines: [{ id, qty }], expected? } validé, ou { error }.
 * expected = le brouillon affiché ({ total, rows: [{ id, qty, unit }] }), obligatoire pour confirmer.
 */
export function parseInvoiceBody(
  body: unknown,
): { commercialId: string; lines: { id: string; qty: number }[]; expected: Expected | null } | { error: string } {
  const b = body as { commercialId?: unknown; lines?: unknown; expected?: unknown } | null;
  const lines = Array.isArray(b?.lines) ? b.lines : null;
  if (typeof b?.commercialId !== "string" || !lines || !lines.length || lines.length > MAX_LINES) {
    return { error: "Requête invalide" };
  }
  const clean: { id: string; qty: number }[] = [];
  for (const l of lines as { id?: unknown; qty?: unknown }[]) {
    const qty = l?.qty;
    if (typeof l?.id !== "string" || typeof qty !== "number" || !Number.isInteger(qty) || qty < 1 || qty > QTY_MAX) {
      return { error: "Ligne invalide" };
    }
    clean.push({ id: l.id, qty });
  }
  let expected: Expected | null = null;
  const e = b.expected as { total?: unknown; rows?: unknown } | undefined;
  if (e != null) {
    if (typeof e.total !== "number" || !Array.isArray(e.rows) || e.rows.length > MAX_LINES) return { error: "Aperçu invalide" };
    const rows: Expected["rows"] = [];
    for (const r of e.rows as { id?: unknown; qty?: unknown; unit?: unknown }[]) {
      if (typeof r?.id !== "string" || typeof r.qty !== "number" || typeof r.unit !== "number") return { error: "Aperçu invalide" };
      rows.push({ id: r.id, qty: r.qty, unit: r.unit });
    }
    expected = { total: e.total, rows };
  }
  return { commercialId: b.commercialId, lines: clean, expected };
}

/**
 * Calcule les lignes côté serveur à partir du catalogue et des prix du commercial (le navigateur n'envoie
 * que les variants et les quantités). Toujours le prix du commercial : un produit sans prix commercial
 * bloque la facture (pas de repli sur le prix du site).
 */
export async function computeDraft(
  commercialId: string,
  lines: { id: string; qty: number }[],
  original?: SavedInvoice | null,
): Promise<{ draft: Draft } | { error: string }> {
  const [{ items }, allPrices, options] = await Promise.all([getCatalog(), getPrices(), getOptions()]);
  const option = options.find((o) => o.id === commercialId);
  if (!option) return { error: "Revendeur inconnu : choisissez un revendeur." };
  const byId = new Map(items.map((i) => [i.id, i]));
  const prices = pricesFor(option, allPrices[option.id] ?? {}, items);

  // Même produit en double : quantités additionnées.
  const merged = new Map<string, number>();
  for (const l of lines) merged.set(l.id, (merged.get(l.id) ?? 0) + l.qty);

  const rows: InvoiceRow[] = [];
  const missing: string[] = [];
  const gone: string[] = [];
  for (const [id, qty] of merged) {
    const item = byId.get(id);
    if (!item) {
      gone.push(id);
      continue;
    }
    const name = displayTitle(item.title, item.brand);
    const variant = item.variant ? displayVariant(item.variant) : null;
    const unit = prices[item.id];
    if (unit == null) {
      missing.push(variant ? `${name} (${variant})` : name);
      continue;
    }
    rows.push({ variantId: item.id, brand: item.brand, name, variant, sku: item.sku, qty, unit, total: lineTotal(unit, qty), sitePrice: false });
  }
  if (missing.length) {
    return {
      error: `Pas de prix revendeur pour ${option.name} : ${missing.join(", ")}. Définissez-le dans Gestion › Prix des produits.`,
    };
  }
  if (gone.length) return { error: `${gone.length} produit(s) ne sont plus sur la boutique : retirez-les du panier.` };
  if (!rows.length) return { error: "Le panier est vide." };

  const before = new Map((original?.rows ?? []).map((r) => [r.variantId, r.unit]));
  const changes = rows
    .filter((r) => before.has(r.variantId) && !sameMoney(before.get(r.variantId)!, r.unit))
    .map((r) => ({ name: r.name, variant: r.variant, before: before.get(r.variantId)!, after: r.unit }));

  const { count, total } = sumRows(rows);
  return { draft: { rows, count, total, commercial: { id: option.id, name: option.name, city: option.city }, changes } };
}

/**
 * Ce que l'admin a vu à l'écran (brouillon) correspond-il exactement au calcul du serveur ?
 * Sinon (prix changé entre-temps sur la boutique ou dans la gestion), on refuse et on renvoie le nouveau calcul.
 */
export function matchesExpected(draft: Draft, expected: Expected): boolean {
  if (!sameMoney(draft.total, expected.total) || draft.rows.length !== expected.rows.length) return false;
  const seen = new Map(expected.rows.map((r) => [r.id, r]));
  return draft.rows.every((r) => {
    const e = seen.get(r.variantId);
    return e != null && e.qty === r.qty && sameMoney(e.unit, r.unit);
  });
}

export type Expected = { total: number; rows: { id: string; qty: number; unit: number }[] };

export async function saveInvoice(input: {
  commercialId: string;
  commercial: string;
  city: string | null;
  rows: InvoiceRow[];
}): Promise<SavedInvoice> {
  assertDurableStorage();
  const { count, total } = sumRows(input.rows);
  const now = new Date();

  if (!isDbConfigured()) {
    const list = mem();
    const id = list.length + 1;
    const inv: SavedInvoice = {
      id,
      number: numberOf(id, now),
      commercialId: input.commercialId,
      commercial: input.commercial,
      city: input.city,
      rows: input.rows,
      count,
      total,
      status: "confirmee",
      createdAt: now.toISOString(),
      updatedAt: null,
    };
    list.unshift(inv);
    return inv;
  }

  await ensureSchema();
  const sql = getSql();
  const [{ id }] = await sql`select nextval(pg_get_serial_sequence('invoices', 'id'))::int as id`;
  const [row] = await sql`
    insert into invoices (id, number, commercial_id, commercial_name, commercial_city, lines, item_count, total, status)
    values (${id}, ${numberOf(id, now)}, ${input.commercialId}, ${input.commercial}, ${input.city},
            ${sql.json(input.rows as never)}, ${count}, ${total}, 'confirmee')
    returning *`;
  return fromRow(row);
}

export async function getInvoice(id: number): Promise<SavedInvoice | null> {
  if (!Number.isSafeInteger(id) || id < 1) return null;
  if (!isDbConfigured()) return mem().find((i) => i.id === id) ?? null;
  await ensureSchema();
  const [row] = await getSql()`select * from invoices where id = ${id}`;
  return row ? fromRow(row) : null;
}

/** Modifier une facture confirmée : mêmes n° et date de création, nouvelles lignes / commercial. */
export async function updateInvoice(
  id: number,
  input: { commercialId: string; commercial: string; city: string | null; rows: InvoiceRow[] },
): Promise<SavedInvoice | null> {
  assertDurableStorage();
  const { count, total } = sumRows(input.rows);
  if (!isDbConfigured()) {
    const inv = mem().find((i) => i.id === id);
    if (!inv) return null;
    Object.assign(inv, {
      commercialId: input.commercialId,
      commercial: input.commercial,
      city: input.city,
      rows: input.rows,
      count,
      total,
      updatedAt: new Date().toISOString(),
    });
    return inv;
  }
  await ensureSchema();
  const sql = getSql();
  const [row] = await sql`
    update invoices
       set commercial_id = ${input.commercialId}, commercial_name = ${input.commercial},
           commercial_city = ${input.city}, lines = ${sql.json(input.rows as never)},
           item_count = ${count}, total = ${total}, updated_at = now()
     where id = ${id}
     returning *`;
  return row ? fromRow(row) : null;
}

export async function listInvoices(limit = 2000): Promise<SavedInvoice[]> {
  if (!isDbConfigured()) return mem().slice(0, limit);
  await ensureSchema();
  const rows = await getSql()`select * from invoices order by created_at desc, id desc limit ${limit}`;
  return rows.map(fromRow);
}

function fromRow(r: Record<string, unknown>): SavedInvoice {
  return {
    id: Number(r.id),
    number: String(r.number),
    commercialId: (r.commercial_id as string | null) ?? null,
    commercial: String(r.commercial_name),
    city: (r.commercial_city as string | null) ?? null,
    rows: (typeof r.lines === "string" ? JSON.parse(r.lines) : r.lines) as InvoiceRow[],
    count: Number(r.item_count),
    total: Number(r.total),
    status: "confirmee",
    createdAt: new Date(r.created_at as string).toISOString(),
    updatedAt: r.updated_at ? new Date(r.updated_at as string).toISOString() : null,
  };
}
