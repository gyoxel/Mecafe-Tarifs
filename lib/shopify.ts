import "server-only";
import type { CatalogItem } from "./types";
import { CATEGORY_ALIASES, FALLBACK_BRAND, FALLBACK_CATEGORY } from "./config";
import { fold } from "./format";

const DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;
const TOKEN = process.env.SHOPIFY_STOREFRONT_TOKEN;
const API_VERSION = process.env.SHOPIFY_API_VERSION ?? "2026-07";

/** Cache des appels Shopify (secondes). Invalidé aussi à la demande via le tag "catalog". */
export const CATALOG_REVALIDATE = 300;
export const CATALOG_TAG = "catalog";

export function isShopifyConfigured(): boolean {
  return Boolean(DOMAIN && TOKEN);
}

const QUERY = /* GraphQL */ `
  query Catalog($cursor: String) {
    products(first: 100, after: $cursor, sortKey: TITLE) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        title
        vendor
        productType
        featuredImage {
          url
        }
        variants(first: 50) {
          nodes {
            id
            title
            sku
            price {
              amount
            }
            compareAtPrice {
              amount
            }
            image {
              url
            }
          }
        }
      }
    }
  }
`;

type GqlVariant = {
  id: string;
  title: string;
  sku: string | null;
  price: { amount: string };
  compareAtPrice: { amount: string } | null;
  image: { url: string } | null;
};
type GqlProduct = {
  id: string;
  title: string;
  vendor: string;
  productType: string;
  featuredImage: { url: string } | null;
  variants: { nodes: GqlVariant[] };
};
type GqlResponse = {
  data?: {
    products: {
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
      nodes: GqlProduct[];
    };
  };
  errors?: { message: string }[];
};

async function fetchPage(cursor: string | null): Promise<NonNullable<GqlResponse["data"]>["products"]> {
  // Un token privé (shpat_…) utilise un en-tête différent d'un token public.
  // TOKEN === "injected" : environnement de développement où un proxy ajoute lui-même l'en-tête
  // d'authentification (le vrai token n'est alors jamais visible ici). Ne pas utiliser en production.
  const tokenHeader: Record<string, string> =
    TOKEN === "injected"
      ? {}
      : TOKEN!.startsWith("shpat_")
        ? { "Shopify-Storefront-Private-Token": TOKEN! }
        : { "X-Shopify-Storefront-Access-Token": TOKEN! };

  const res = await fetch(`https://${DOMAIN}/api/${API_VERSION}/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...tokenHeader },
    body: JSON.stringify({ query: QUERY, variables: { cursor } }),
    // Une page = une entrée de cache (limite de 2 Mo par entrée respectée).
    next: { revalidate: CATALOG_REVALIDATE, tags: [CATALOG_TAG] },
  });
  if (!res.ok) throw new Error(`Shopify a répondu ${res.status}`);
  const json = (await res.json()) as GqlResponse;
  if (json.errors?.length) throw new Error(`Shopify GraphQL : ${json.errors.map((e) => e.message).join("; ")}`);
  if (!json.data) throw new Error("Réponse Shopify vide");
  return json.data.products;
}

const numericId = (gid: string) => gid.split("/").pop() ?? gid;

function categoryOf(productType: string): string {
  const raw = productType.trim();
  if (!raw) return FALLBACK_CATEGORY;
  return CATEGORY_ALIASES[fold(raw)] ?? raw;
}

export async function fetchShopifyCatalog(): Promise<CatalogItem[]> {
  const items: CatalogItem[] = [];
  let cursor: string | null = null;

  // Garde-fou : 50 pages × 100 produits.
  for (let page = 0; page < 50; page++) {
    const products = await fetchPage(cursor);

    for (const p of products.nodes) {
      const brand = p.vendor.trim() || FALLBACK_BRAND;
      const category = categoryOf(p.productType);
      for (const v of p.variants.nodes) {
        const compareAt = v.compareAtPrice ? parseFloat(v.compareAtPrice.amount) : null;
        const price = parseFloat(v.price.amount);
        items.push({
          id: numericId(v.id),
          productId: numericId(p.id),
          title: p.title,
          variant: v.title === "Default Title" ? null : v.title,
          brand,
          category,
          sku: v.sku?.trim() || null,
          image: v.image?.url ?? p.featuredImage?.url ?? null,
          price,
          compareAt: compareAt && compareAt > price ? compareAt : null,
        });
      }
    }

    if (!products.pageInfo.hasNextPage) break;
    cursor = products.pageInfo.endCursor;
  }
  return items;
}
