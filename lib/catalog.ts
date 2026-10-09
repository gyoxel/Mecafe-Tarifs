import "server-only";
import type { CatalogItem, CatalogSource } from "./types";
import { BRAND_ORDER, CATEGORY_ORDER, FALLBACK_CATEGORY } from "./config";
import { fold, slug } from "./format";
import { DEMO_ITEMS } from "./demo-data";
import { buildMenu, inNode, pruneMenu, type MenuNode, type RawMenuItem } from "./menu";
import { fetchCollectionOrders, fetchShopifyCatalog, fetchShopifyMenu, isShopifyConfigured } from "./shopify";

const brandRank = (brand: string) => {
  const i = BRAND_ORDER.findIndex((b) => fold(b) === fold(brand));
  return i === -1 ? BRAND_ORDER.length : i;
};

const OTHERS_HANDLE = "__autres";

/** Collections citées directement dans le menu brut (tous niveaux). */
function menuHandles(raw: RawMenuItem[]): string[] {
  const out = new Set<string>();
  const walk = (items: RawMenuItem[]) =>
    items.forEach((it) => {
      if (it.resource?.handle) out.add(it.resource.handle);
      walk(it.items ?? []);
    });
  walk(raw);
  return [...out];
}

/**
 * Catégories de repli (menu Shopify absent, démo) : une entrée par catégorie déduite des collections,
 * via une collection fictive « cat:… » ajoutée à chaque produit.
 */
function fallbackMenu(items: CatalogItem[]): MenuNode[] {
  const rank = (c: string) => {
    const i = CATEGORY_ORDER.findIndex((o) => fold(o) === fold(c));
    return i === -1 ? CATEGORY_ORDER.length : i;
  };
  for (const it of items) it.collections = [...it.collections, `cat:${slug(it.category)}`];
  return [...new Set(items.map((i) => i.category))]
    .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b, "fr"))
    .map((c) => ({ id: slug(c), title: c, handles: [`cat:${slug(c)}`], children: [] }));
}

/** handle de collection → ids produits dans l'ordre du site. */
export type CollectionOrder = Record<string, string[]>;

export async function getCatalog(): Promise<{
  items: CatalogItem[];
  source: CatalogSource;
  menu: MenuNode[];
  order: CollectionOrder;
}> {
  const source: CatalogSource = isShopifyConfigured() ? "shopify" : "demo";
  let items: CatalogItem[];
  let menu: MenuNode[] | null = null;
  let order: CollectionOrder = {};

  if (source === "shopify") {
    // En parallèle : produits | menu puis ordre des collections du menu.
    const menuAndOrder = fetchShopifyMenu().then(async (raw) => ({
      raw,
      order: raw ? await fetchCollectionOrders(menuHandles(raw)) : {},
    }));
    const [shopItems, { raw: rawMenu, order: menuOrder }] = await Promise.all([fetchShopifyCatalog(), menuAndOrder]);
    order = menuOrder;
    if (rawMenu) {
      const titles = new Map<string, string>();
      for (const it of shopItems) it.collections.forEach((h, i) => titles.set(h, it.collectionTitles[i]));
      // Seules les entrées qui contiennent au moins un produit sont gardées.
      menu = pruneMenu(buildMenu(rawMenu, titles), (n) => shopItems.some((it) => inNode(it.collections, n)));
      // Entrées sans collection rattachées par leur titre (ex. « Dosettes ») : ordre lu en complément.
      const handles = new Set<string>();
      const collect = (nodes: MenuNode[]) => nodes.forEach((n) => (n.handles.forEach((h) => handles.add(h)), collect(n.children)));
      collect(menu);
      const missing = [...handles].filter((h) => !(h in order));
      if (missing.length) order = { ...order, ...(await fetchCollectionOrders(missing)) };
    }
    items = shopItems.map(({ collectionTitles: _t, ...it }) => it);
  } else {
    items = DEMO_ITEMS.map((it) => ({ ...it, collections: [...it.collections] }));
  }

  if (menu && menu.length) {
    // Libellé principal : première catégorie du menu (hors promotions) qui contient le produit.
    const main = menu.filter((n) => !/promo/i.test(n.title));
    for (const it of items) {
      const node = main.find((n) => inNode(it.collections, n)) ?? menu.find((n) => inNode(it.collections, n));
      it.category = node?.title ?? FALLBACK_CATEGORY;
    }
    // Produits hors menu : catégorie « Autres » pour qu'aucun ne soit introuvable.
    const orphans = items.filter((it) => !menu!.some((n) => inNode(it.collections, n)));
    if (orphans.length) {
      for (const it of orphans) it.collections = [...it.collections, OTHERS_HANDLE];
      menu.push({ id: "autres", title: FALLBACK_CATEGORY, handles: [OTHERS_HANDLE], children: [] });
    }
  } else {
    menu = fallbackMenu(items);
  }

  // Marques dans l'ordre voulu, puis produits par nom ; les formats d'un même produit
  // restent côte à côte, du moins cher au plus cher.
  items.sort(
    (a, b) =>
      brandRank(a.brand) - brandRank(b.brand) ||
      a.brand.localeCompare(b.brand, "fr") ||
      a.title.localeCompare(b.title, "fr") ||
      a.productId.localeCompare(b.productId) ||
      a.price - b.price,
  );
  return { items, source, menu, order };
}
