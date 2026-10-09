import { fold } from "./format";
import type { CatalogItem, PriceMap } from "./types";

/**
 * Catalogue de démonstration, utilisé tant que SHOPIFY_STORE_DOMAIN / SHOPIFY_STOREFRONT_TOKEN
 * ne sont pas définis. Les prix commerciaux de démo volontairement NON uniformes.
 */
// [marque, catégorie, produit, format, prix site, prix commercial | null]
const ROWS: [string, string, string, string | null, number, number | null][] = [
  ["Kimbo", "Café", "Kimbo Espresso Napoletano", "250 g moulu", 129, 109],
  ["Kimbo", "Café", "Kimbo Espresso Napoletano", "1 kg grains", 389, 359],
  ["Kimbo", "Café", "Kimbo Aroma Intenso", "1 kg grains", 369, 345],
  ["Kimbo", "Café", "Kimbo Extra Cream", "1 kg grains", 349, 322],
  ["Kimbo", "Café", "Kimbo Décaféiné", "250 g moulu", 119, null],
  ["Kimbo", "Capsules", "Kimbo Capsules Napoletano", "×16", 99, 79],
  ["Kimbo", "Capsules", "Kimbo Capsules Intenso", "×16", 99, 79],
  ["Kimbo", "Capsules", "Kimbo Capsules Décaféiné", "×16", 99, 80],
  ["Caffitaly", "Capsules", "Caffitaly Ristretto", "×10", 59, 49],
  ["Caffitaly", "Capsules", "Caffitaly Intenso", "×10", 59, 49],
  ["Caffitaly", "Capsules", "Caffitaly Cremoso", "×10", 59, 48],
  ["Caffitaly", "Capsules", "Caffitaly Décaféiné", "×10", 59, 50],
  ["Caffitaly", "Machines", "Caffitaly Machine S32", null, 1290, 1190],
  ["Mécafé", "Café", "Mécafé Signature", "250 g moulu", 95, 79],
  ["Mécafé", "Café", "Mécafé Signature", "1 kg grains", 289, 265],
  ["Mécafé", "Café", "Mécafé Arabica Pur", "250 g moulu", 119, 99],
  ["Mécafé", "Café", "Mécafé Décaféiné", "250 g moulu", 99, 85],
  ["Mécafé", "Capsules", "Mécafé Capsules Signature", "×10", 55, 45],
  ["Mécafé", "Machines", "Mécafé Machine Espresso Pro", null, 4990, 4690],
  ["ODK", "Sirops", "ODK Sirop Vanille", "70 cl", 79, 62],
  ["ODK", "Sirops", "ODK Sirop Caramel", "70 cl", 79, 62],
  ["ODK", "Sirops", "ODK Sirop Noisette", "70 cl", 79, 62],
  ["ODK", "Sirops", "ODK Sirop Menthe", "70 cl", 79, null],
  ["ODK", "Sirops", "ODK Sirop Pistache", "70 cl", 89, 72],
  ["Foodness", "Sauces", "Foodness Sauce Chocolat", "1 kg", 89, 69],
  ["Foodness", "Sauces", "Foodness Sauce Caramel", "1 kg", 89, 70],
  ["Foodness", "Sauces", "Foodness Sauce Fruits Rouges", "1 kg", 95, 76],
  ["Foodness", "Chocolat / Boissons", "Foodness Chocolat Chaud", "1 kg", 109, 89],
  ["Foodness", "Chocolat / Boissons", "Foodness Frappé Vanille", "1 kg", 99, 79],
  ["Flair", "Sirops", "Flair Sirop Grenadine", "1 L", 69, 55],
  ["Flair", "Sirops", "Flair Sirop Menthe", "1 L", 69, 55],
  ["Flair", "Sauces", "Flair Purée de Fraise", "1 kg", 85, 68],
  ["Flair", "Chocolat / Boissons", "Flair Smoothie Mangue", "1 kg", 99, null],
];

export const DEMO_ITEMS: CatalogItem[] = ROWS.map(([brand, category, title, variant, price], i) => ({
  id: String(9000 + i),
  productId: String(8000 + i),
  title,
  variant,
  brand,
  category,
  sku: `${fold(brand).slice(0, 3).toUpperCase()}-${String(100 + i)}`,
  image: null,
  price,
  compareAt: null,
  stock: i % 7 === 3 ? 0 : (i * 37) % 140,
  collections: [],
}));

export const DEMO_PRICES: PriceMap = Object.fromEntries(
  ROWS.flatMap(([, , , , , commercial], i) => (commercial == null ? [] : [[String(9000 + i), commercial]])),
);
