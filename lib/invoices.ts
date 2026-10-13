import "server-only";
import { QTY_MAX } from "./cart";
import { getCatalog } from "./catalog";
import { assertDurableStorage, ensureSchema, getSql, isDbConfigured } from "./db";
import { KIND_PREFIX, isDocKind, sumRows, type DocKind, type Draft, type InvoiceRow, type SavedInvoice } from "./invoice-types";

export type { Draft };
import { lineTotal, sameMoney } from "./money";
import { CITY_MAX } from "./cities";
import { NAME_MAX, cleanPhone, isBase, pricesFor } from "./options";
import { getOptions } from "./price-options";
import { getPrices } from "./prices";
import { displayTitle, displayVariant } from "./title";

/**
 * Historique des devis et commandes confirmés : Postgres si DATABASE_URL est défini, mémoire sinon (démo).
 * Le n° est attribué à l'enregistrement : D{mois}{année}-{rang} pour un devis (ex. D102026-200), C… pour une
 * commande (ex. C102026-200), chacun compté à part, à l'heure du Maroc, et repartant à 200 chaque mois.
 * (Les anciennes factures gardent leur n° F….)
 */
const g = globalThis as unknown as { __memInvoices?: SavedInvoice[]; __memDeleted?: Set<number> };
const mem = () => (g.__memInvoices ??= []);
/** Démo : devis supprimés (gardés dans `mem` pour la numérotation). */
const deletedMem = () => (g.__memDeleted ??= new Set<number>());

/** « D102026- » (devis) ou « C102026- » (commande) : préfixe du mois (heure du Maroc). */
function monthPrefix(d: Date, kind: DocKind): string {
  const parts = new Intl.DateTimeFormat("fr-FR", { timeZone: "Africa/Casablanca", month: "2-digit", year: "numeric" })
    .formatToParts(d)
    .reduce<Record<string, string>>((acc, p) => ((acc[p.type] = p.value), acc), {});
  return `${KIND_PREFIX[kind]}${parts.month}${parts.year}-`;
}
/** Premier rang de chaque mois (devis comme commandes) : D102026-200, puis 201… */
const FIRST_NUMBER = 200;

/**
 * N° suivant du mois, d'après les n° déjà attribués (« D102026-207 » → « D102026-208 »), jamais sous 200 : un mois
 * qui avait déjà des n° plus bas (001, 002… avant ce changement) continue à 200.
 */
function nextNumber(prefix: string, existing: string[]): string {
  const max = existing.reduce((m, n) => {
    const k = n.startsWith(prefix) ? Number(n.slice(prefix.length)) : 0;
    return Number.isInteger(k) && k > m ? k : m;
  }, 0);
  return `${prefix}${String(Math.max(max + 1, FIRST_NUMBER)).padStart(3, "0")}`;
}

export const MAX_LINES = 500;

/** Infos tapées dans le panier « Prix Gros » pour un client qui n'est pas un revendeur enregistré. */
export type ClientInfo = { name?: string; city?: string; phone?: string };

/** Ligne envoyée par le panier : prix unitaire facultatif (saisi à la main, sinon prix du revendeur). */
export type CartInput = { id: string; qty: number; price?: number };
export const PRICE_MAX = 1_000_000;

/**
 * Corps { commercialId, lines: [{ id, qty, price? }], expected? } validé, ou { error }.
 * expected = le brouillon affiché ({ total, rows: [{ id, qty, unit }] }), obligatoire pour confirmer.
 */
export function parseInvoiceBody(
  body: unknown,
):
  | { commercialId: string; lines: CartInput[]; expected: Expected | null; client: ClientInfo; kind: DocKind }
  | { error: string } {
  const b = body as {
    commercialId?: unknown;
    lines?: unknown;
    expected?: unknown;
    clientName?: unknown;
    clientCity?: unknown;
    clientPhone?: unknown;
    kind?: unknown;
  } | null;
  const lines = Array.isArray(b?.lines) ? b.lines : null;
  if (typeof b?.commercialId !== "string" || !lines || !lines.length || lines.length > MAX_LINES) {
    return { error: "Requête invalide" };
  }
  const clean: CartInput[] = [];
  for (const l of lines as { id?: unknown; qty?: unknown; price?: unknown }[]) {
    const qty = l?.qty;
    if (typeof l?.id !== "string" || typeof qty !== "number" || !Number.isInteger(qty) || qty < 1 || qty > QTY_MAX) {
      return { error: "Ligne invalide" };
    }
    const price = l.price;
    if (price != null && (typeof price !== "number" || !Number.isFinite(price) || price < 0 || price > PRICE_MAX)) {
      return { error: "Prix invalide" };
    }
    clean.push(price == null ? { id: l.id, qty } : { id: l.id, qty, price: Math.round(price * 100) / 100 });
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
  // « Prix Gros » : nom, ville, téléphone du client tapés dans le panier (sans créer de revendeur), tous facultatifs.
  const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "");
  if ((b.clientName != null && typeof b.clientName !== "string") || (b.clientCity != null && typeof b.clientCity !== "string")) {
    return { error: "Infos du client invalides" };
  }
  const phone = cleanPhone(b.clientPhone);
  if (phone === null) return { error: "Téléphone du client invalide" };
  const client: ClientInfo = {
    name: text(b.clientName, NAME_MAX) || undefined,
    city: text(b.clientCity, CITY_MAX) || undefined,
    phone: phone || undefined,
  };
  if (b.kind != null && !isDocKind(b.kind)) return { error: "Type de document invalide" };
  return { commercialId: b.commercialId, lines: clean, expected, client, kind: isDocKind(b.kind) ? b.kind : "devis" };
}

/**
 * Calcule les lignes côté serveur à partir du catalogue et des prix du revendeur (le navigateur envoie les
 * variants, les quantités et, s'il a été changé à la main dans le panier, le prix unitaire). Sans prix saisi
 * dans le panier, toujours le prix du revendeur : un produit sans prix revendeur bloque le devis.
 */
export async function computeDraft(
  commercialId: string,
  lines: CartInput[],
  original?: SavedInvoice | null,
  client: ClientInfo = {},
): Promise<{ draft: Draft } | { error: string }> {
  const [{ items }, allPrices, options] = await Promise.all([getCatalog(), getPrices(), getOptions()]);
  const option = options.find((o) => o.id === commercialId);
  if (!option) return { error: "Revendeur inconnu : choisissez un revendeur." };
  const byId = new Map(items.map((i) => [i.id, i]));
  const prices = pricesFor(option, allPrices, items);

  // Même produit en double : quantités additionnées (dernier prix saisi gardé).
  const merged = new Map<string, number>();
  const manual = new Map<string, number>();
  for (const l of lines) {
    merged.set(l.id, (merged.get(l.id) ?? 0) + l.qty);
    if (l.price != null) manual.set(l.id, l.price);
  }

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
    const typed = manual.get(item.id);
    const unit = typed ?? prices[item.id];
    if (unit == null) {
      missing.push(variant ? `${name} (${variant})` : name);
      continue;
    }
    const row: InvoiceRow = { variantId: item.id, brand: item.brand, name, variant, sku: item.sku, qty, unit, total: lineTotal(unit, qty), sitePrice: false };
    if (typed != null) row.manual = true;
    rows.push(row);
  }
  if (missing.length) {
    return {
      error: `Pas de prix revendeur pour ${option.name} : ${missing.join(", ")}. Saisissez le prix dans le panier, ou dans Gestion › Prix des produits.`,
    };
  }
  if (gone.length) return { error: `${gone.length} produit(s) ne sont plus sur la boutique : retirez-les du panier.` };
  if (!rows.length) return { error: "Le panier est vide." };

  const before = new Map((original?.rows ?? []).map((r) => [r.variantId, r.unit]));
  const changes = rows
    .filter((r) => before.has(r.variantId) && !sameMoney(before.get(r.variantId)!, r.unit))
    .map((r) => ({ name: r.name, variant: r.variant, before: before.get(r.variantId)!, after: r.unit }));

  const { count, total } = sumRows(rows);
  // Prix Gros avec les infos d'un client tapées dans le panier : sur le devis et dans l'historique (prix Prix Gros).
  const commercial = isBase(option)
    ? { id: option.id, name: client.name ?? option.name, city: client.city ?? null, phone: client.phone ?? null }
    : { id: option.id, name: option.name, city: option.city, phone: option.phone };
  return { draft: { rows, count, total, commercial, changes } };
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
  kind: DocKind;
  commercialId: string;
  commercial: string;
  city: string | null;
  phone: string | null;
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
      number: nextNumber(monthPrefix(now, input.kind), list.map((i) => i.number)),
      kind: input.kind,
      commercialId: input.commercialId,
      commercial: input.commercial,
      city: input.city,
      phone: input.phone,
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
  const prefix = monthPrefix(now, input.kind);
  // Verrou le temps de compter et d'insérer : deux confirmations simultanées n'ont jamais le même n°.
  const row = await getSql().begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(727010)`;
    const taken = await tx<{ number: string }[]>`
      select number from invoices where number like ${`${prefix}%`}`;
    const [inserted] = await tx`
      insert into invoices (number, kind, commercial_id, commercial_name, commercial_city, commercial_phone, lines,
                            item_count, total, status)
      values (${nextNumber(prefix, taken.map((t) => t.number))}, ${input.kind}, ${input.commercialId}, ${input.commercial},
              ${input.city}, ${input.phone}, ${tx.json(input.rows as never)}, ${count}, ${total}, 'confirmee')
      returning *`;
    return inserted;
  });
  return fromRow(row as Record<string, unknown>);
}

export async function getInvoice(id: number): Promise<SavedInvoice | null> {
  if (!Number.isSafeInteger(id) || id < 1) return null;
  if (!isDbConfigured()) return mem().find((i) => i.id === id && !deletedMem().has(i.id)) ?? null;
  await ensureSchema();
  const [row] = await getSql()`select * from invoices where id = ${id} and status <> 'supprime'`;
  return row ? fromRow(row) : null;
}

/** Modifier un devis confirmé : mêmes n° et date de création, nouvelles lignes / commercial. */
export async function updateInvoice(
  id: number,
  input: { commercialId: string; commercial: string; city: string | null; phone: string | null; rows: InvoiceRow[] },
): Promise<SavedInvoice | null> {
  assertDurableStorage();
  const { count, total } = sumRows(input.rows);
  if (!isDbConfigured()) {
    const inv = mem().find((i) => i.id === id && !deletedMem().has(i.id));
    if (!inv) return null;
    Object.assign(inv, {
      commercialId: input.commercialId,
      commercial: input.commercial,
      city: input.city,
      phone: input.phone,
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
           commercial_city = ${input.city}, commercial_phone = ${input.phone}, lines = ${sql.json(input.rows as never)},
           item_count = ${count}, total = ${total}, updated_at = now()
     where id = ${id} and status <> 'supprime'
     returning *`;
  return row ? fromRow(row) : null;
}

export async function listInvoices(limit = 2000): Promise<SavedInvoice[]> {
  if (!isDbConfigured()) return mem().filter((i) => !deletedMem().has(i.id)).slice(0, limit);
  await ensureSchema();
  const rows = await getSql()`
    select * from invoices where status <> 'supprime' order by created_at desc, id desc limit ${limit}`;
  return rows.map(fromRow);
}

/**
 * Supprimer des devis : ils disparaissent de l'historique, mais les lignes sont gardées (statut « supprime ») pour
 * que leurs n° ne soient jamais redonnés. Retourne le nombre de devis supprimés.
 */
export async function deleteInvoices(ids: number[]): Promise<number> {
  assertDurableStorage();
  const clean = [...new Set(ids)].filter((id) => Number.isSafeInteger(id) && id > 0);
  if (!clean.length) return 0;
  if (!isDbConfigured()) {
    let n = 0;
    for (const id of clean) {
      if (mem().some((i) => i.id === id) && !deletedMem().has(id)) {
        deletedMem().add(id);
        n++;
      }
    }
    return n;
  }
  await ensureSchema();
  const rows = await getSql()`
    update invoices set status = 'supprime', updated_at = now()
     where id = any(${clean}::bigint[]) and status <> 'supprime'
    returning id`;
  return rows.length;
}

function fromRow(r: Record<string, unknown>): SavedInvoice {
  return {
    id: Number(r.id),
    number: String(r.number),
    kind: isDocKind(r.kind) ? r.kind : "devis",
    commercialId: (r.commercial_id as string | null) ?? null,
    commercial: String(r.commercial_name),
    city: (r.commercial_city as string | null) ?? null,
    phone: (r.commercial_phone as string | null) ?? null,
    rows: (typeof r.lines === "string" ? JSON.parse(r.lines) : r.lines) as InvoiceRow[],
    count: Number(r.item_count),
    total: Number(r.total),
    status: "confirmee",
    createdAt: new Date(r.created_at as string).toISOString(),
    updatedAt: r.updated_at ? new Date(r.updated_at as string).toISOString() : null,
  };
}
