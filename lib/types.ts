/** Une ligne du catalogue = un variant (format) Shopify. */
export type CatalogItem = {
  /** ID numérique du variant Shopify : clé stable des prix commerciaux. */
  id: string;
  productId: string;
  /** Nom du produit (sans le format). */
  title: string;
  /** Format / variant ("250 g", "×16"…). null si produit sans variant. */
  variant: string | null;
  /** Fournisseur Shopify (champ `vendor`). */
  brand: string;
  category: string;
  sku: string | null;
  image: string | null;
  /** Prix public du site (Shopify), en DH. */
  price: number;
  /** Ancien prix barré sur le site, si promotion. */
  compareAt: number | null;
};

/** variantId → prix commercial (DH). Absent = pas de prix commercial défini. */
export type PriceMap = Record<string, number>;

export type CatalogSource = "shopify" | "demo";
