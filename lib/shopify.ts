import "server-only";
import type { CatalogItem } from "./types";
import type { RawMenuItem } from "./menu";
import { canonicalBrand, categoryOf } from "./config";

const DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;
const TOKEN = process.env.SHOPIFY_STOREFRONT_TOKEN;
const API_VERSION = process.env.SHOPIFY_API_VERSION ?? "2026-07";

/**
 * Pas de cache : chaque affichage du catalogue relit Shopify, un changement sur le site (prix, produit,
 * menu, ordre des collections) est visible au rechargement suivant. Les appels sont regroupés
 * (2 pages produits + menu + ordre de toutes les collections en une requête) pour rester rapides.
 */

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
        collections(first: 20) {
          nodes {
            handle
            title
          }
        }
        variants(first: 50) {
          nodes {
            id
            title
            sku
            quantityAvailable
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
  quantityAvailable: number | null;
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
  collections?: { nodes: { handle: string; title: string }[] };
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

function tokenHeaders(): Record<string, string> {
  // TOKEN === "injected" : environnement de développement où un proxy ajoute lui-même l'en-tête
  // d'authentification (le vrai token n'est alors jamais visible ici). Ne pas utiliser en production.
  if (TOKEN === "injected") return {};
  return TOKEN!.startsWith("shpat_")
    ? { "Shopify-Storefront-Private-Token": TOKEN! }
    : { "X-Shopify-Storefront-Access-Token": TOKEN! };
}

async function fetchPage(cursor: string | null): Promise<NonNullable<GqlResponse["data"]>["products"]> {
  // Un token privé (shpat_…) utilise un en-tête différent d'un token public.
  const res = await fetch(`https://${DOMAIN}/api/${API_VERSION}/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...tokenHeaders() },
    body: JSON.stringify({ query: QUERY, variables: { cursor } }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Shopify a répondu ${res.status}`);
  const json = (await res.json()) as GqlResponse;
  if (json.errors?.length) throw new Error(`Shopify GraphQL : ${json.errors.map((e) => e.message).join("; ")}`);
  if (!json.data) throw new Error("Réponse Shopify vide");
  return json.data.products;
}

const numericId = (gid: string) => gid.split("/").pop() ?? gid;

/** Item interne : titres des collections en plus (pour rattacher les entrées de menu sans collection). */
export type ShopifyItem = CatalogItem & { collectionTitles: string[] };

export async function fetchShopifyCatalog(): Promise<ShopifyItem[]> {
  const items: ShopifyItem[] = [];
  let cursor: string | null = null;

  // Garde-fou : 50 pages × 100 produits.
  for (let page = 0; page < 50; page++) {
    const products = await fetchPage(cursor);

    for (const p of products.nodes) {
      const brand = canonicalBrand(p.vendor);
      const cols = p.collections?.nodes ?? [];
      const category = categoryOf(
        cols.map((c) => c.title),
        p.productType,
      );
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
          stock: v.quantityAvailable,
          collections: cols.map((c) => c.handle),
          collectionTitles: cols.map((c) => c.title),
        });
      }
    }

    if (!products.pageInfo.hasNextPage) break;
    cursor = products.pageInfo.endCursor;
  }
  return items;
}

/** Menu de navigation servant de catégories (Contenu → Menus dans Shopify). */
export const MENU_HANDLE = process.env.SHOPIFY_MENU_HANDLE || "main-menu-gx";

const MENU_QUERY = /* GraphQL */ `
  query Menu($handle: String!) {
    menu(handle: $handle) {
      items {
        title
        type
        resource {
          ... on Collection {
            handle
          }
        }
        items {
          title
          type
          resource {
            ... on Collection {
              handle
            }
          }
          items {
            title
            type
            resource {
              ... on Collection {
                handle
              }
            }
          }
        }
      }
    }
  }
`;

/** Menu brut, ou null s'il est introuvable / inaccessible (le catalogue retombe alors sur ses règles). */
export async function fetchShopifyMenu(): Promise<RawMenuItem[] | null> {
  try {
    const res = await fetch(`https://${DOMAIN}/api/${API_VERSION}/graphql.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...tokenHeaders() },
      body: JSON.stringify({ query: MENU_QUERY, variables: { handle: MENU_HANDLE } }),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: { menu: { items: RawMenuItem[] } | null }; errors?: unknown[] };
    if (json.errors?.length || !json.data?.menu) return null;
    return json.data.menu.items;
  } catch {
    return null;
  }
}

/**
 * Ordre des produits de chaque collection, tel que réglé dans Shopify (le même que sur le site).
 * Toutes les collections sont lues en une requête (alias c0, c1…). handle → ids produits dans l'ordre.
 * En cas d'erreur, renvoie {} : le catalogue garde alors l'ordre marque / nom.
 */
export async function fetchCollectionOrders(handles: string[]): Promise<Record<string, string[]>> {
  if (!handles.length) return {};
  const fields = handles
    .map(
      (h, i) =>
        `c${i}: collection(handle: ${JSON.stringify(h)}) { products(first: 250, sortKey: COLLECTION_DEFAULT) { nodes { id } } }`,
    )
    .join("\n");
  try {
    const res = await fetch(`https://${DOMAIN}/api/${API_VERSION}/graphql.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...tokenHeaders() },
      body: JSON.stringify({ query: `{\n${fields}\n}` }),
      cache: "no-store",
    });
    if (!res.ok) return {};
    const json = (await res.json()) as {
      data?: Record<string, { products: { nodes: { id: string }[] } } | null>;
    };
    const out: Record<string, string[]> = {};
    handles.forEach((h, i) => {
      const nodes = json.data?.[`c${i}`]?.products.nodes;
      if (nodes) out[h] = nodes.map((n) => numericId(n.id));
    });
    return out;
  } catch {
    return {};
  }
}
