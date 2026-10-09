import type { CatalogItem } from "./types";
import { fold } from "./format";

/** Texte de recherche d'un produit : nom, format, marque, catégorie, SKU. */
export function haystackOf(item: CatalogItem): string {
  return fold([item.title, item.variant, item.brand, item.category, item.sku].filter(Boolean).join(" "));
}

/** Tous les mots tapés doivent être présents (ordre indifférent, accents ignorés). */
export function tokensOf(query: string): string[] {
  return fold(query).split(" ").filter(Boolean);
}

export function matchesAll(haystack: string, tokens: string[]): boolean {
  for (const t of tokens) if (!haystack.includes(t)) return false;
  return true;
}
