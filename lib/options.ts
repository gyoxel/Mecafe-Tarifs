import { fold } from "./format";
import { fromCents, toCents } from "./money";
import type { CatalogItem, PriceMap } from "./types";

/**
 * Revendeurs (« options » de prix dans le code). Chacun a un écart appliqué automatiquement au prix du site,
 * et ses propres prix saisis à la main qui remplacent ce calcul produit par produit.
 *
 * « Revendeur » (BASE_ID) est la base, sans nom propre : c'est le tarif affiché par défaut dans l'admin, et un
 * nouveau revendeur part de son écart et de ses prix saisis (copiés à la création, modifiables ensuite).
 */
export type PriceOption = {
  id: string;
  name: string;
  /** Ville de l'option (filtre et recherche dans la liste), ou null. */
  city: string | null;
  /** Écart en DH ajouté au prix du site (−10 = prix site moins 10 DH). */
  offset: number;
  /** Option affichée à l'ouverture tant que l'appareil n'en a pas choisi une autre. */
  isDefault: boolean;
};

/** Prix saisis à la main, par option (id option → variantId → prix). */
export type OptionPrices = Record<string, PriceMap>;

/** Le revendeur de base : tarif par défaut, modèle des nouveaux revendeurs. Ne peut pas être supprimé. */
export const BASE_ID = "base";
export const BASE_NAME = "Revendeur";
export const isBase = (o: { id: string } | null | undefined) => o?.id === BASE_ID;

/** Créé au premier lancement : la base seule (les revendeurs nommés s'ajoutent dans la gestion). */
export const SEED_OPTIONS: PriceOption[] = [{ id: BASE_ID, name: BASE_NAME, city: null, offset: -10, isDefault: true }];

export const NAME_MAX = 60;
export const OFFSET_LIMIT = 100_000;

/** Le tarif de base (« Revendeur »), affiché par défaut. */
export function defaultOption(options: PriceOption[]): PriceOption | undefined {
  return options.find(isBase) ?? options.find((o) => o.isDefault) ?? options[0];
}

/** « −10 DH », « +5 DH », « 0 DH ». */
export function formatOffset(offset: number): string {
  const abs = String(Math.abs(offset)).replace(".", ",");
  return `${offset < 0 ? "−" : offset > 0 ? "+" : ""}${abs} DH`;
}

/**
 * Montant saisi après le « − » fixe : "10", "7,5" → écart −10, −7,5 ; null si vide ; NaN si invalide.
 * Un signe tapé quand même est ignoré : l'écart est toujours une baisse.
 */
export function parseOffset(raw: string): number | null {
  const s = raw.replace(/dh|mad/gi, "").replace(/[\s  +\-−]/g, "").replace(",", ".");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) && n <= OFFSET_LIMIT ? -Math.round(n * 100) / 100 || 0 : NaN;
}

/** Texte du champ d'écart (sans le « − » affiché à côté) : −7,5 → "7,5". */
export const offsetInput = (offset: number) => String(Math.abs(offset)).replace(".", ",");

/** Prix automatique de l'option (prix site + écart), ou null s'il serait ≤ 0. */
export function autoPrice(option: PriceOption, sitePrice: number): number | null {
  const cents = toCents(sitePrice) + toCents(option.offset);
  return cents > 0 ? fromCents(cents) : null;
}

/** Prix commercial appliqué : prix saisi dans l'option, sinon prix automatique. */
export function effectivePrice(option: PriceOption, saved: PriceMap, item: CatalogItem): number | undefined {
  return saved[item.id] ?? autoPrice(option, item.price) ?? undefined;
}

/** Carte variantId → prix appliqué pour une option (ce que voit le commercial). */
export function pricesFor(option: PriceOption, saved: PriceMap, items: CatalogItem[]): PriceMap {
  const out: PriceMap = {};
  for (const it of items) {
    const p = effectivePrice(option, saved, it);
    if (p != null) out[it.id] = p;
  }
  return out;
}

/** Recherche sur le nom et la ville ; chaque mot tapé doit se retrouver. */
export function matchesOption(option: PriceOption, query: string): boolean {
  const hay = fold(`${option.name} ${option.city ?? ""}`);
  return fold(query)
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => hay.includes(w));
}

/** Option choisie, mémorisée par appareil (même clé pour le catalogue et la page de modification). */
export const OPTION_STORAGE_KEY = "mecafe:option";
