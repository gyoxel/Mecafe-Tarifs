import { fold } from "./format";

/**
 * Réglages d'affichage du catalogue.
 * Marque = champ Fournisseur de Shopify (vendor) ; catégorie = déduite des collections
 * Shopify (ex. « Kimbo - CAPSULES ») puis du Type de produit.
 */
export const BRAND_ORDER = ["Mécafé", "Kimbo", "Caffitaly", "ODK", "Foodness", "Flair"];

/** Fournisseur Shopify (minuscules, sans accents) → nom de marque affiché. */
export const BRAND_ALIASES: Record<string, string> = {
  orsadrinks: "ODK",
  orsadrink: "ODK",
};

export const CATEGORY_ORDER = [
  "Café",
  "Capsules",
  "Dosettes",
  "Sirops",
  "Sauces",
  "Chocolat / Boissons",
  "Machines",
  "Accessoires",
];

/**
 * Règles de catégorisation. Elles s'appliquent (sans accents ni majuscules) au titre de chaque collection
 * du produit et à son Type de produit ; la règle la plus haute de la liste l'emporte.
 * L'ordre compte : « Machines à capsules » doit être vu comme Machines avant d'être vu comme Capsules,
 * et un produit présent dans « Sirop » et « Sauce » est une Sauce.
 */
export const CATEGORY_RULES: [RegExp, string][] = [
  [/machine/, "Machines"],
  [/accessoire/, "Accessoires"],
  [/capsule/, "Capsules"],
  [/dosette/, "Dosettes"],
  [/sauce/, "Sauces"],
  [/sirop/, "Sirops"],
  [/\bcafe\b/, "Café"],
  [/fruit puree|frappe|fruity|smoothie|iced tea|chai|nfc|creamy|chocolat|boisson/, "Chocolat / Boissons"],
];

export const FALLBACK_CATEGORY = "Autres";
export const FALLBACK_BRAND = "Autres marques";

export function canonicalBrand(vendor: string): string {
  const key = fold(vendor);
  if (!key) return FALLBACK_BRAND;
  return BRAND_ALIASES[key] ?? BRAND_ORDER.find((b) => fold(b) === key) ?? vendor.trim();
}

export function categoryOf(collectionTitles: string[], productType: string): string {
  const candidates = [...collectionTitles, productType].map(fold).filter(Boolean);
  let best = Infinity;
  for (const text of candidates) {
    const i = CATEGORY_RULES.findIndex(([re]) => re.test(text));
    if (i !== -1 && i < best) best = i;
  }
  return best !== Infinity ? CATEGORY_RULES[best][1] : productType.trim() || FALLBACK_CATEGORY;
}
