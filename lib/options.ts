import { fold } from "./format";
import type { CatalogItem, PriceMap } from "./types";

/**
 * Options de prix commerciaux (A, B, C, ou le nom d'un commercial…), gérées depuis la page de modification.
 * Chaque option a un écart appliqué automatiquement au prix du site, et ses propres prix saisis à la main
 * qui remplacent ce calcul produit par produit. L'écart suit donc le prix du site en direct.
 */
export type PriceOption = {
  id: string;
  name: string;
  /** Écart en DH ajouté au prix du site (−10 = prix site moins 10 DH). */
  offset: number;
  /** Option affichée à l'ouverture tant que l'appareil n'en a pas choisi une autre. */
  isDefault: boolean;
};

/** Prix saisis à la main, par option (id option → variantId → prix). */
export type OptionPrices = Record<string, PriceMap>;

/** Options créées au premier lancement (C par défaut). */
export const SEED_OPTIONS: PriceOption[] = [
  { id: "a", name: "A", offset: -10, isDefault: false },
  { id: "b", name: "B", offset: -9, isDefault: false },
  { id: "c", name: "C", offset: -8, isDefault: true },
];

export const NAME_MAX = 60;
export const OFFSET_LIMIT = 100_000;

export function defaultOption(options: PriceOption[]): PriceOption | undefined {
  return options.find((o) => o.isDefault) ?? options[0];
}

/** « −10 DH », « +5 DH », « 0 DH ». */
export function formatOffset(offset: number): string {
  const abs = String(Math.abs(offset)).replace(".", ",");
  return `${offset < 0 ? "−" : offset > 0 ? "+" : ""}${abs} DH`;
}

/** "-10", "−10", "10,5", "-8 DH" → nombre ; null si vide ; NaN si invalide. */
export function parseOffset(raw: string): number | null {
  const s = raw.replace(/dh|mad/gi, "").replace(/[\s  ]/g, "").replace("−", "-").replace(",", ".");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) && Math.abs(n) <= OFFSET_LIMIT ? Math.round(n * 100) / 100 : NaN;
}

/** Prix automatique de l'option (prix site + écart), ou null s'il serait ≤ 0. */
export function autoPrice(option: PriceOption, sitePrice: number): number | null {
  const p = Math.round((sitePrice + option.offset) * 100) / 100;
  return p > 0 ? p : null;
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

export function matchesOption(option: PriceOption, query: string): boolean {
  const q = fold(query.trim());
  return !q || fold(option.name).includes(q);
}

/** Option choisie, mémorisée par appareil (même clé pour le catalogue et la page de modification). */
export const OPTION_STORAGE_KEY = "mecafe:option";
