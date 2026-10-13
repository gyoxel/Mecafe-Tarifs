import { fold } from "./format";
import { fromCents, toCents } from "./money";
import type { CatalogItem, PriceMap } from "./types";

/**
 * Revendeurs (« options » de prix dans le code).
 *
 * « Prix Gros » (BASE_ID) est le tarif de base : affiché par défaut dans l'admin ; ses prix sont saisis produit
 * par produit (un produit sans prix = « — »).
 *
 * Un revendeur SUIT un modèle : « Prix Gros » (par défaut) ou le prix du site (case cochée à la création).
 * Pour chaque produit, son prix est le prix saisi pour lui s'il y en a un (il reste alors fixe), sinon celui du
 * modèle : changer un prix de « Prix Gros » change aussi les revendeurs qui n'ont pas leur propre prix pour ce
 * produit. Effacer le prix saisi d'un revendeur le refait suivre son modèle.
 *
 * L'ancien « écart » (prix site − N DH) n'existe plus : à la mise à jour, les prix qu'il donnait ont été
 * enregistrés produit par produit (lib/price-freeze.ts), puis l'écart remis à 0.
 */
export type PriceOption = {
  id: string;
  name: string;
  /** Ville de l'option (filtre et recherche dans la liste), ou null. */
  city: string | null;
  /** Téléphone (facultatif), repris sur ses devis et commandes. */
  phone: string | null;
  /** Ancien écart en DH (prix site + écart) : 0 une fois figé en prix par produit (lib/price-freeze.ts). */
  offset: number;
  /** Option affichée à l'ouverture tant que l'appareil n'en a pas choisi une autre. */
  isDefault: boolean;
  /** Modèle suivi pour les produits sans prix saisi : « Prix Gros » ou le prix du site (sans objet pour la base). */
  source: PriceSource;
};

export type PriceSource = "base" | "site";
export const SOURCE_LABEL: Record<PriceSource, string> = { base: "Prix Gros", site: "Prix du site" };

/** Prix saisis à la main, par option (id option → variantId → prix). */
export type OptionPrices = Record<string, PriceMap>;

/** Le tarif de base « Prix Gros » : affiché par défaut, modèle des nouveaux revendeurs. Ne peut pas être supprimé. */
export const BASE_ID = "base";
export const BASE_NAME = "Prix Gros";
export const isBase = (o: { id: string } | null | undefined) => o?.id === BASE_ID;

/** Créé au premier lancement : la base seule (les revendeurs nommés s'ajoutent dans la gestion). */
export const SEED_OPTIONS: PriceOption[] = [
  { id: BASE_ID, name: BASE_NAME, city: null, phone: null, offset: 0, isDefault: true, source: "base" },
];

export const NAME_MAX = 60;
export const PHONE_MAX = 30;

/** Téléphone saisi : chiffres, espaces, + ( ) - . seulement ; "" si vide ; null si invalide. */
export function cleanPhone(raw: unknown): string | null {
  if (raw == null) return "";
  if (typeof raw !== "string") return null;
  const s = raw.trim().replace(/\s+/g, " ");
  if (!s) return "";
  return s.length <= PHONE_MAX && /^[0-9+()\-. ]+$/.test(s) && /\d/.test(s) ? s : null;
}

/** Le tarif de base (« Prix Gros »), affiché par défaut. */
export function defaultOption(options: PriceOption[]): PriceOption | undefined {
  return options.find(isBase) ?? options.find((o) => o.isDefault) ?? options[0];
}

/** Ancien prix automatique (prix site + écart), ou null s'il serait ≤ 0 : sert seulement à figer l'écart. */
export function autoPrice(option: PriceOption, sitePrice: number): number | null {
  const cents = toCents(sitePrice) + toCents(option.offset);
  return cents > 0 ? fromCents(cents) : null;
}

/** Prix que le revendeur reçoit de son modèle pour ce produit (sans son prix saisi), ou undefined. */
export function inheritedPrice(option: PriceOption, all: OptionPrices, item: Pick<CatalogItem, "id" | "price">) {
  if (isBase(option)) return undefined;
  return option.source === "site" ? item.price : all[BASE_ID]?.[item.id];
}

/** Prix revendeur appliqué : son prix saisi, sinon celui de son modèle ; undefined = pas de prix revendeur. */
export function effectivePrice(
  option: PriceOption,
  all: OptionPrices,
  item: Pick<CatalogItem, "id" | "price">,
): number | undefined {
  return all[option.id]?.[item.id] ?? inheritedPrice(option, all, item);
}

/** Carte variantId → prix appliqué pour une option (ce que voit le commercial). */
export function pricesFor(option: PriceOption, all: OptionPrices, items: CatalogItem[]): PriceMap {
  const out: PriceMap = {};
  for (const it of items) {
    const p = effectivePrice(option, all, it);
    if (p != null) out[it.id] = p;
  }
  return out;
}

/** Recherche sur le nom et la ville ; chaque mot tapé doit se retrouver. */
export function matchesOption(option: PriceOption, query: string): boolean {
  const hay = fold(`${option.name} ${option.city ?? ""} ${option.phone ?? ""}`);
  return fold(query)
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => hay.includes(w));
}

/** Option choisie, mémorisée par appareil (même clé pour le catalogue et la page de modification). */
export const OPTION_STORAGE_KEY = "mecafe:option";
