import type { InvoiceRow } from "./invoice-types";
import { displayTitle, displayVariant } from "./title";
import type { CatalogItem, PriceMap } from "./types";

/** Panier de l'admin : variants et quantités, dans l'ordre d'ajout (mémorisé sur l'appareil). */
export type CartLine = { id: string; qty: number };

export const CART_STORAGE_KEY = "mecafe:panier";
export const EDIT_STORAGE_KEY = "mecafe:panier-modification";

/** Le panier contient une facture confirmée en cours de modification. */
export type CartEditing = { id: number; number: string };

export function readEditing(): CartEditing | null {
  try {
    const v = JSON.parse(localStorage.getItem(EDIT_STORAGE_KEY) ?? "null") as CartEditing | null;
    return v && Number.isInteger(v.id) && typeof v.number === "string" ? v : null;
  } catch {
    return null;
  }
}

export function writeEditing(v: CartEditing | null) {
  try {
    if (v) localStorage.setItem(EDIT_STORAGE_KEY, JSON.stringify(v));
    else localStorage.removeItem(EDIT_STORAGE_KEY);
  } catch {}
}
export const QTY_MAX = 9999;

/** Quantité saisie : entier 0…QTY_MAX, ou null si invalide / vide. */
export function parseQty(raw: string): number | null {
  const s = raw.replace(/\s/g, "");
  if (!/^\d+$/.test(s)) return null;
  return Math.min(Number(s), QTY_MAX);
}

export function readCart(): CartLine[] {
  try {
    const raw = JSON.parse(localStorage.getItem(CART_STORAGE_KEY) ?? "[]") as unknown;
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((l): l is CartLine => typeof l?.id === "string" && Number.isInteger(l?.qty) && l.qty > 0)
      .map((l) => ({ id: l.id, qty: Math.min(l.qty, QTY_MAX) }));
  } catch {
    return [];
  }
}

export function writeCart(lines: CartLine[]) {
  try {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(lines));
  } catch {}
}

/** Ligne du panier prête à afficher : prix du commercial choisi, ou prix du site s'il n'en a pas. */
export type ResolvedLine = {
  item: CatalogItem;
  qty: number;
  unit: number;
  /** true : pas de prix commercial pour ce produit, le prix du site est utilisé. */
  sitePrice: boolean;
  total: number;
};

export function resolveCart(lines: CartLine[], byId: Map<string, CatalogItem>, prices: PriceMap): ResolvedLine[] {
  const out: ResolvedLine[] = [];
  for (const l of lines) {
    const item = byId.get(l.id);
    if (!item) continue; // produit retiré de la boutique
    const commercial = prices[item.id];
    const unit = commercial ?? item.price;
    out.push({ item, qty: l.qty, unit, sitePrice: commercial == null, total: Math.round(unit * l.qty * 100) / 100 });
  }
  return out;
}

/** N° de facture lisible et unique à la minute : F20261009-1432. */
export function invoiceNumber(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `F${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

export function invoiceDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** Lignes du panier au format facture (aperçu du brouillon). */
export function toInvoiceRows(lines: ResolvedLine[]): InvoiceRow[] {
  return lines.map((l) => ({
    variantId: l.item.id,
    brand: l.item.brand,
    name: displayTitle(l.item.title, l.item.brand),
    variant: l.item.variant ? displayVariant(l.item.variant) : null,
    sku: l.item.sku,
    qty: l.qty,
    unit: l.unit,
    total: l.total,
    sitePrice: l.sitePrice,
  }));
}
