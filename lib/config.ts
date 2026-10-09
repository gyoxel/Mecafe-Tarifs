/**
 * Réglages d'affichage du catalogue (ordre des marques / catégories).
 * Les valeurs viennent de Shopify (Fournisseur = vendor, Type de produit = productType) ;
 * ces listes ne servent qu'à ORDONNER et à NORMALISER. Tout ce qui n'y figure pas
 * reste affiché, trié par ordre alphabétique après les valeurs listées.
 */
export const BRAND_ORDER = ["Mécafé", "Kimbo", "Caffitaly", "ODK", "Foodness", "Flair"];

export const CATEGORY_ORDER = [
  "Café",
  "Capsules",
  "Sirops",
  "Sauces",
  "Chocolat / Boissons",
  "Machines",
];

/**
 * Regroupe des types Shopify différents sous une même catégorie.
 * Clé : type Shopify en minuscules sans accents ; valeur : nom affiché.
 * Exemple : { "cafe en grains": "Café", "cafe moulu": "Café" }
 */
export const CATEGORY_ALIASES: Record<string, string> = {};

export const FALLBACK_CATEGORY = "Autres";
export const FALLBACK_BRAND = "Autres marques";
