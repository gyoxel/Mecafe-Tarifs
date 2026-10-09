import "server-only";
import type { CatalogItem, CatalogSource } from "./types";
import { BRAND_ORDER } from "./config";
import { fold } from "./format";
import { DEMO_ITEMS } from "./demo-data";
import { fetchShopifyCatalog, isShopifyConfigured } from "./shopify";

const brandRank = (brand: string) => {
  const i = BRAND_ORDER.findIndex((b) => fold(b) === fold(brand));
  return i === -1 ? BRAND_ORDER.length : i;
};

export async function getCatalog(): Promise<{ items: CatalogItem[]; source: CatalogSource }> {
  const source: CatalogSource = isShopifyConfigured() ? "shopify" : "demo";
  const items = source === "shopify" ? await fetchShopifyCatalog() : [...DEMO_ITEMS];

  // Tri stable : marques dans l'ordre voulu, puis alphabétique ; les formats d'un produit restent groupés.
  items.sort(
    (a, b) =>
      brandRank(a.brand) - brandRank(b.brand) ||
      a.brand.localeCompare(b.brand, "fr") ||
      a.title.localeCompare(b.title, "fr"),
  );
  return { items, source };
}
