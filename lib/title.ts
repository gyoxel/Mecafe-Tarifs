import { BRAND_ALIASES } from "./config";
import { fold } from "./format";

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Titre raccourci pour les cartes (affichage seulement : la recherche et l'admin gardent le titre Shopify).
 * Retire ce que la carte affiche déjà (la marque) et les mentions répétées sur toute une gamme,
 * pour que la partie qui distingue les produits reste visible.
 */
export function displayTitle(title: string, brand: string): string {
  const names = [brand, ...Object.entries(BRAND_ALIASES).filter(([, b]) => fold(b) === fold(brand)).map(([v]) => v)];
  const brandRe = names.map(escape).join("|");

  let t = title
    .replace(/\s*compatibles?\s+nespresso\s*®?\s*\*?\s*original\s+en\s+aluminium/i, " Nespresso")
    .replace(/[®*]+/g, "")
    // « … – Orsadrinks », « … - FOODNESS - 500g »
    .replace(new RegExp(`\\s*[-–:]\\s*(?:${brandRe})\\b\\s*`, "gi"), " ")
    // « Kimbo Espresso … » → « Espresso … »
    .replace(new RegExp(`^(?:${brandRe})\\s+(?=\\S)`, "i"), "")
    .replace(/\s+[-–]\s*$/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  // Seulement des mentions de marque : on garde l'original.
  if (t.length < 3) return title;
  if (/^[a-zà-ÿ]/.test(t)) t = t.charAt(0).toUpperCase() + t.slice(1);
  return t;
}

/** Couleurs saisies en anglais dans Shopify → français. */
const COLORS: Record<string, string> = {
  black: "Noir",
  white: "Blanc",
  red: "Rouge",
  grey: "Gris",
  gray: "Gris",
  blue: "Bleu",
  green: "Vert",
  silver: "Argent",
  brown: "Marron",
  pink: "Rose",
  yellow: "Jaune",
  gold: "Doré",
  cream: "Crème",
  purple: "Violet",
};

/**
 * Format / variante affiché (affichage seulement) : couleurs en français et unités homogènes.
 * « Red » → « Rouge », « 1KG » → « 1 kg », « 1bouteille » → « 1 bouteille ».
 */
export function displayVariant(variant: string): string {
  const v = variant.trim().replace(/\s+/g, " ");
  const color = COLORS[fold(v)];
  if (color) return color;
  return v
    .replace(/(\d+(?:[.,]\d+)?)\s*kg\b/gi, "$1 kg")
    .replace(/(\d+(?:[.,]\d+)?)\s*(?:gr|g)\b/gi, "$1 g")
    .replace(/(\d+(?:[.,]\d+)?)\s*cl\b/gi, "$1 cl")
    .replace(/\b1\s*bouteilles?\b/gi, "1 bouteille")
    .replace(/(\d+)\s*bouteilles?\b/gi, (_, n) => `${n} bouteille${n === "1" ? "" : "s"}`);
}
