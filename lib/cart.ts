import { lineTotal, sumMoney } from "./money";
import type { CatalogItem, PriceMap } from "./types";

/**
 * Panier de l'admin : variants et quantités, dans l'ordre d'ajout (mémorisé sur l'appareil). `price` : prix
 * unitaire changé à la main pour ce devis (sinon le prix du revendeur choisi).
 */
export type CartLine = { id: string; qty: number; price?: number };
export const CART_PRICE_MAX = 1_000_000;
const validPrice = (p: unknown): p is number =>
  typeof p === "number" && Number.isFinite(p) && p >= 0 && p <= CART_PRICE_MAX;

export const CART_STORAGE_KEY = "mecafe:panier";
/** Nom du client tapé dans le panier quand les prix sont ceux de « Prix Gros » (pas un revendeur enregistré). */
export const CLIENT_STORAGE_KEY = "mecafe:panier-client";
/** Devis ou commande, choisi en haut du panier. */
export const KIND_STORAGE_KEY = "mecafe:panier-type";
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
      .map((l) => ({ id: l.id, qty: Math.min(l.qty, QTY_MAX), ...(validPrice(l.price) ? { price: l.price } : {}) }));
  } catch {
    return [];
  }
}

export function writeCart(lines: CartLine[]) {
  try {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(lines));
  } catch {}
}

/** Ligne du panier prête à afficher : prix saisi dans le panier, sinon prix du revendeur choisi. */
export type ResolvedLine = {
  item: CatalogItem;
  qty: number;
  /** Prix unitaire appliqué ; null = pas de prix (le devis ne peut pas être confirmé). */
  unit: number | null;
  /** Prix du revendeur pour ce produit (null s'il n'en a pas). */
  resellerUnit: number | null;
  /** true : prix changé à la main dans le panier. */
  manual: boolean;
  /** unit × qty au centime près (0 si pas de prix). */
  total: number;
};

/** Prix saisi dans le panier, sinon celui du revendeur choisi : jamais de repli sur le prix du site. */
export function resolveCart(lines: CartLine[], byId: Map<string, CatalogItem>, prices: PriceMap): ResolvedLine[] {
  const out: ResolvedLine[] = [];
  for (const l of lines) {
    const item = byId.get(l.id);
    if (!item) continue; // produit retiré de la boutique
    const resellerUnit = prices[item.id] ?? null;
    const manual = l.price != null;
    const unit = manual ? l.price! : resellerUnit;
    out.push({ item, qty: l.qty, unit, resellerUnit, manual, total: unit == null ? 0 : lineTotal(unit, l.qty) });
  }
  return out;
}

/** Total du panier au centime près (lignes sans prix exclues). */
export const cartTotal = (lines: ResolvedLine[]) => sumMoney(lines.map((l) => l.total));

export function invoiceDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}
