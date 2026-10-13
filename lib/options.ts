import { fold } from "./format";
import { fromCents, toCents } from "./money";
import type { CatalogItem, PriceMap } from "./types";

/**
 * Revendeurs (« options » de prix dans le code). Chaque revendeur a son prix pour chaque produit, saisi dans
 * Gestion › Prix des produits ; un produit sans prix saisi n'a pas de prix revendeur (« — »).
 *
 * « Prix Gros » (BASE_ID) est le tarif de base : affiché par défaut dans l'admin, et un nouveau revendeur part
 * de ses prix (copiés à la création, modifiables ensuite).
 *
 * L'ancien « écart » (prix site − N DH) n'existe plus : à la mise à jour, les prix qu'il donnait ont été
 * enregistrés produit par produit (lib/price-freeze.ts), puis l'écart remis à 0.
 */
export type PriceOption = {
  id: string;
  name: string;
  /** Ville de l'option (filtre et recherche dans la liste), ou null. */
  city: string | null;
  /** Ancien écart en DH (prix site + écart) : 0 une fois figé en prix par produit (lib/price-freeze.ts). */
  offset: number;
  /** Option affichée à l'ouverture tant que l'appareil n'en a pas choisi une autre. */
  isDefault: boolean;
};

/** Prix saisis à la main, par option (id option → variantId → prix). */
export type OptionPrices = Record<string, PriceMap>;

/** Le tarif de base « Prix Gros » : affiché par défaut, modèle des nouveaux revendeurs. Ne peut pas être supprimé. */
export const BASE_ID = "base";
export const BASE_NAME = "Prix Gros";
export const isBase = (o: { id: string } | null | undefined) => o?.id === BASE_ID;

/** Créé au premier lancement : la base seule (les revendeurs nommés s'ajoutent dans la gestion). */
export const SEED_OPTIONS: PriceOption[] = [{ id: BASE_ID, name: BASE_NAME, city: null, offset: 0, isDefault: true }];

export const NAME_MAX = 60;

/** Le tarif de base (« Prix Gros »), affiché par défaut. */
export function defaultOption(options: PriceOption[]): PriceOption | undefined {
  return options.find(isBase) ?? options.find((o) => o.isDefault) ?? options[0];
}

/** Ancien prix automatique (prix site + écart), ou null s'il serait ≤ 0 : sert seulement à figer l'écart. */
export function autoPrice(option: PriceOption, sitePrice: number): number | null {
  const cents = toCents(sitePrice) + toCents(option.offset);
  return cents > 0 ? fromCents(cents) : null;
}

/** Prix revendeur appliqué : le prix saisi pour ce produit, ou undefined (pas de prix revendeur). */
export function effectivePrice(_option: PriceOption, saved: PriceMap, item: CatalogItem): number | undefined {
  return saved[item.id];
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
