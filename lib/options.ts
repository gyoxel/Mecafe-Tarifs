import type { CatalogItem, PriceMap } from "./types";

/**
 * Grilles de prix commerciaux. Chaque option a ses propres prix enregistrés ; A, B et C se remplissent
 * automatiquement (prix site + écart) pour tout produit qui n'a pas de prix saisi à la main dans l'option.
 * L'écart suit donc le prix du site en direct. « Autre » n'a pas d'écart : elle part vide.
 */
export const PRICE_OPTIONS = [
  { id: "a", label: "Option A", short: "A", offset: -10 },
  { id: "b", label: "Option B", short: "B", offset: -9 },
  { id: "c", label: "Option C", short: "C", offset: -8 },
  { id: "autre", label: "Autre", short: "Autre", offset: null },
] as const satisfies readonly { id: string; label: string; short: string; offset: number | null }[];

export type PriceOptionId = (typeof PRICE_OPTIONS)[number]["id"];
export type PriceOption = (typeof PRICE_OPTIONS)[number];

/** Prix saisis à la main, par option (option → variantId → prix). */
export type OptionPrices = Record<PriceOptionId, PriceMap>;

export const DEFAULT_OPTION: PriceOptionId = "a";

export function isOptionId(v: unknown): v is PriceOptionId {
  return PRICE_OPTIONS.some((o) => o.id === v);
}

export function optionOf(id: PriceOptionId): PriceOption {
  return PRICE_OPTIONS.find((o) => o.id === id)!;
}

export const emptyOptionPrices = (): OptionPrices => ({ a: {}, b: {}, c: {}, autre: {} });

/** Prix automatique de l'option (prix site + écart), ou null (pas d'écart, ou prix ≤ 0). */
export function autoPrice(option: PriceOption, sitePrice: number): number | null {
  if (option.offset == null) return null;
  const p = Math.round((sitePrice + option.offset) * 100) / 100;
  return p > 0 ? p : null;
}

/** Prix commercial appliqué : prix saisi dans l'option, sinon prix automatique. */
export function effectivePrice(option: PriceOption, saved: PriceMap, item: CatalogItem): number | undefined {
  return saved[item.id] ?? autoPrice(option, item.price) ?? undefined;
}

/** Carte variantId → prix appliqué pour une option (ce que voit le commercial). */
export function pricesFor(id: PriceOptionId, saved: PriceMap, items: CatalogItem[]): PriceMap {
  const option = optionOf(id);
  const out: PriceMap = {};
  for (const it of items) {
    const p = effectivePrice(option, saved, it);
    if (p != null) out[it.id] = p;
  }
  return out;
}

/** Option choisie, mémorisée par appareil (même clé pour le catalogue et la page de modification). */
export const OPTION_STORAGE_KEY = "mecafe:option";
