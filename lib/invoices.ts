import "server-only";
import { QTY_MAX } from "./cart";
import { getCatalog } from "./catalog";
import { ensureSchema, getSql, isDbConfigured } from "./db";
import { sumRows, type InvoiceRow, type SavedInvoice } from "./invoice-types";
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

/** Corps { commercialId, lines: [{ id, qty }] } validé, ou { error }. */
export function parseInvoiceBody(body: unknown): { commercialId: string; lines: { id: string; qty: number }[] } | { error: string } {
  const b = body as { commercialId?: unknown; lines?: unknown } | null;
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
  return { commercialId: b.commercialId, lines: clean };
}

/**
 * Construit les lignes côté serveur à partir du catalogue et des prix du commercial :
 * le navigateur n'envoie que les variants et les quantités.
 */
export async function buildRows(
  commercialId: string,
  lines: { id: string; qty: number }[],
): Promise<{ rows: InvoiceRow[]; commercial: { id: string; name: string; city: string | null } } | null> {
  const [{ items }, allPrices, options] = await Promise.all([getCatalog(), getPrices(), getOptions()]);
  const option = options.find((o) => o.id === commercialId);
  if (!option) return null;
  const byId = new Map(items.map((i) => [i.id, i]));
  const prices = pricesFor(option, allPrices[option.id] ?? {}, items);

  const rows: InvoiceRow[] = [];
  for (const l of lines) {
    const item = byId.get(l.id);
    if (!item) continue; // produit retiré de la boutique entre-temps
    const commercial = prices[item.id];
    const unit = commercial ?? item.price;
    rows.push({
      variantId: item.id,
      brand: item.brand,
      name: displayTitle(item.title, item.brand),
      variant: item.variant ? displayVariant(item.variant) : null,
      sku: item.sku,
      qty: l.qty,
      unit,
      total: Math.round(unit * l.qty * 100) / 100,
      sitePrice: commercial == null,
    });
  }
  return { rows, commercial: { id: option.id, name: option.name, city: option.city } };
}

export async function saveInvoice(input: {
  commercialId: string;
  commercial: string;
  city: string | null;
  rows: InvoiceRow[];
}): Promise<SavedInvoice> {
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
