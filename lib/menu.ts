import { fold, slug } from "./format";

/** Une entrée du menu Shopify utilisée comme catégorie. `handles` = collections couvertes (sous-menus compris). */
export type MenuNode = { id: string; title: string; handles: string[]; children: MenuNode[] };

/** Forme brute renvoyée par la Storefront API (menu → items → items → items). */
export type RawMenuItem = {
  title: string;
  type: string;
  resource: { handle?: string } | null;
  items?: RawMenuItem[];
};

/** « SIROPS & BOISSONS » → « Sirops & Boissons » (seulement si le titre est tout en majuscules). */
export function prettyTitle(title: string): string {
  const t = title.trim().replace(/\s+/g, " ");
  if (t !== t.toUpperCase()) return t;
  // Sigles seuls (« 100% NFC ») : on garde tel quel.
  if (!/\p{L}{4,}/u.test(t)) return t;
  const small = new Set(["à", "a", "de", "du", "des", "et", "en", "la", "le", "les", "d'", "pour"]);
  return t
    .toLowerCase()
    .split(" ")
    .map((w, i) => (i > 0 && small.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

/**
 * Construit l'arbre de catégories à partir du menu Shopify :
 * - jusqu'à 3 niveaux (catégorie › sous-catégorie › détail), les niveaux plus profonds fusionnés ;
 * - une entrée sans collection (ex. une page « Dosettes ») est rattachée aux collections dont le titre
 *   contient son nom ;
 * - les entrées qui ne couvrent aucune collection (Accueil, Contact…) sont ignorées.
 */
export function buildMenu(raw: RawMenuItem[], collectionTitles: Map<string, string>): MenuNode[] {
  const byTitle = (title: string): string[] => {
    const key = fold(title).replace(/[^a-z0-9 ]/g, " ").trim();
    if (!key) return [];
    const re = new RegExp(`(^|\\W)${key.replace(/\s+/g, "\\W+")}(\\W|$)`);
    return [...collectionTitles].filter(([, t]) => re.test(fold(t))).map(([h]) => h);
  };
  const handlesOf = (item: RawMenuItem): string[] => {
    const own = item.resource?.handle ? [item.resource.handle] : [];
    const desc = (item.items ?? []).flatMap(handlesOf);
    const all = [...new Set([...own, ...desc])];
    return all.length ? all : byTitle(item.title);
  };

  const used = new Set<string>();
  const uniqueId = (title: string) => {
    let id = slug(title) || "categorie";
    while (used.has(id)) id += "-2";
    used.add(id);
    return id;
  };

  const MAX_DEPTH = 3;
  const toNode = (item: RawMenuItem, depth: number): MenuNode | null => {
    const handles = handlesOf(item);
    if (!handles.length) return null;
    const children =
      depth < MAX_DEPTH
        ? (item.items ?? [])
            .map((child) => toNode(child, depth + 1))
            .filter((n): n is MenuNode => n !== null)
        : [];
    // Identifiant court (utilisé dans l'URL : ?categorie=cafe/cafe-en-grains/mecafe-1kg).
    return { id: uniqueId(item.title), title: prettyTitle(item.title), handles, children };
  };
  return raw.map((item) => toNode(item, 1)).filter((n): n is MenuNode => n !== null);
}

/** Retire récursivement les entrées qui ne contiennent aucun produit. */
export function pruneMenu(nodes: MenuNode[], has: (node: MenuNode) => boolean): MenuNode[] {
  return nodes.filter(has).map((n) => ({ ...n, children: pruneMenu(n.children, has) }));
}

/** Suit un chemin d'identifiants (catégorie › sous-catégorie › …) ; s'arrête au premier inconnu. */
export function resolvePath(menu: MenuNode[], path: string[]): MenuNode[] {
  const out: MenuNode[] = [];
  let level = menu;
  for (const id of path) {
    const node = level.find((n) => n.id === id);
    if (!node) break;
    out.push(node);
    level = node.children;
  }
  return out;
}

export function inNode(collections: string[], node: MenuNode): boolean {
  return node.handles.some((h) => collections.includes(h));
}
