import { inNode, type MenuNode } from "./menu";
import type { CatalogItem } from "./types";

/** Groupe du catalogue : une entrée finale du menu, avec ses parents (fil d'Ariane). */
export type Leaf = { node: MenuNode; crumbs: MenuNode[] };

/** Entrées finales du menu dans l'ordre du site ; celles des promotions à la fin. */
export function menuLeaves(nodes: MenuNode[]): Leaf[] {
  const regular: Leaf[] = [];
  const promos: Leaf[] = [];
  const walk = (list: MenuNode[], crumbs: MenuNode[], promo: boolean) => {
    for (const n of list) {
      const isPromo = promo || /promo/i.test(n.title);
      if (n.children.length) walk(n.children, [...crumbs, n], isPromo);
      else (isPromo ? promos : regular).push({ node: n, crumbs });
    }
  };
  walk(nodes, [], false);
  return [...regular, ...promos];
}

export type Grouped = { it: CatalogItem; i: number; k: number; r: number };

/**
 * Range `results` par groupe (k = index dans `leaves`, leaves.length = hors menu), dans l'ordre du site.
 * Un produit n'apparaît qu'une fois. S'il est dans plusieurs groupes, il va dans le plus précis
 * (celui qui contient le moins de produits parmi `all`) : Pack Dégustation → Mécafé 250g, sauces → Sauces.
 * Les promotions ne servent de groupe qu'aux produits qui ne sont dans aucune autre catégorie.
 * Dans un groupe : ordre de la collection sur le site (les formats d'un même produit restent ensemble).
 */
export function groupItems(
  results: CatalogItem[],
  all: CatalogItem[],
  leaves: Leaf[],
  order: Record<string, string[]>,
): Grouped[] {
  const sizes = leaves.map((l) => all.filter((it) => inNode(it.collections, l.node)).length);
  const positions = new Map<string, Map<string, number>>();
  for (const [handle, ids] of Object.entries(order)) positions.set(handle, new Map(ids.map((id, i) => [id, i])));
  const rankIn = (it: CatalogItem, k: number): number => {
    const leaf = leaves[k];
    if (!leaf) return Infinity;
    for (const h of leaf.node.handles) {
      const pos = positions.get(h)?.get(it.productId);
      if (pos !== undefined) return pos;
    }
    return Infinity;
  };
  const promoStart = leaves.findIndex((l) => /promo/i.test([...l.crumbs, l.node].map((n) => n.title).join(" ")));
  const keyed = results.map((it, i) => {
    const ks = leaves.flatMap((l, k) => (inNode(it.collections, l.node) ? [k] : []));
    const regular = promoStart === -1 ? ks : ks.filter((k) => k < promoStart);
    const pool = regular.length ? regular : ks;
    const k = pool.length ? pool.reduce((best, k) => (sizes[k] < sizes[best] ? k : best)) : leaves.length;
    return { it, i, k, r: rankIn(it, k) };
  });
  keyed.sort((a, b) => a.k - b.k || (a.r === b.r ? 0 : a.r < b.r ? -1 : 1) || a.i - b.i);
  return keyed;
}
