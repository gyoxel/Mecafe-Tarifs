"use client";

import Link from "next/link";
import { Fragment, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { slug } from "@/lib/format";
import { inNode, resolvePath, type MenuNode } from "@/lib/menu";
import { haystackOf, matchesAll, tokensOf } from "@/lib/search";
import type { CatalogItem, CatalogSource, PriceMap } from "@/lib/types";
import { brandStyle } from "@/lib/brands";
import { BrandBadge } from "./BrandLogo";
import { CloseIcon, EyeIcon, GridIcon, ListIcon, LogoutIcon, SearchIcon, SettingsIcon } from "./Icons";
import { ProductCard } from "./ProductCard";
import { ProductRow } from "./ProductRow";

const PAGE_SIZE = 60;

type Props = {
  items: CatalogItem[];
  prices: PriceMap;
  source: CatalogSource;
  /** Catégories = menu Shopify (niveau 1) et sous-catégories (niveau 2). */
  menu: MenuNode[];
  /** Ordre des produits dans chaque collection (handle → ids produits), comme sur le site. */
  order: Record<string, string[]>;
  isAdmin: boolean;
  initial: { q: string; brand: string; path: string[] };
};

type Facet = { name: string; count: number };

function countBy(list: CatalogItem[], key: "brand" | "category"): Map<string, number> {
  const m = new Map<string, number>();
  for (const it of list) m.set(it[key], (m.get(it[key]) ?? 0) + 1);
  return m;
}

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? "s" : ""}`;

/** Champ de recherche. */
function SearchField({
  value,
  onChange,
  inputRef,
}: {
  value: string;
  onChange: (v: string) => void;
  inputRef: React.Ref<HTMLInputElement>;
}) {
  return (
    <label className="search">
      <SearchIcon className="search-icon" size={18} />
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Rechercher un produit..."
        aria-label="Rechercher un produit"
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        enterKeyHint="search"
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            onChange("");
            e.currentTarget.blur();
          }
        }}
      />
      <kbd className="search-kbd" aria-hidden="true">
        /
      </kbd>
      {value && (
        <button type="button" className="search-clear" aria-label="Effacer la recherche" onClick={() => onChange("")}>
          <CloseIcon size={14} />
        </button>
      )}
    </label>
  );
}

/** Interrupteur de l'œil global. */
function GlobalEye({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      className="global-eye"
      aria-pressed={on}
      onClick={onToggle}
      title={on ? "Masquer tous les prix commerciaux" : "Afficher tous les prix commerciaux"}
    >
      <EyeIcon off={!on} size={18} />
      <span className="global-eye-label">Tarifs commerciaux</span>
      <span className="switch" aria-hidden="true">
        <span className="switch-thumb" />
      </span>
    </button>
  );
}

export function Catalog({ items, prices, source, menu, order, isAdmin, initial }: Props) {
  // ── Filtres ───────────────────────────────────────────────────────
  const brands = useMemo(() => [...new Set(items.map((i) => i.brand))], [items]);

  const [query, setQuery] = useState(initial.q);
  const [brand, setBrand] = useState<string | null>(() => brands.find((b) => slug(b) === initial.brand) ?? null);
  // Catégorie sélectionnée = chemin dans le menu (catégorie › sous-catégorie › détail).
  const [path, setPath] = useState<string[]>(() => resolvePath(menu, initial.path).map((n) => n.id));
  const trail = resolvePath(menu, path);
  const catNode = trail[0] ?? null;
  const [limit, setLimit] = useState(PAGE_SIZE);
  const deferredQuery = useDeferredValue(query);

  const changeQuery = (v: string) => {
    // Une nouvelle recherche porte sur tout le catalogue : on quitte la catégorie / marque en cours.
    if (!query.trim() && v.trim()) {
      setBrand(null);
      setPath([]);
    }
    setQuery(v);
    setLimit(PAGE_SIZE);
  };
  // Recherche et filtres ne se combinent pas : choisir une marque / catégorie efface la recherche,
  // et commencer une recherche efface les filtres (voir changeQuery).
  // Choisir une marque montre toute la marque (la catégorie en cours est quittée).
  const pickBrand = (b: string | null) => {
    setQuery("");
    setPath([]);
    setBrand(b);
    setLimit(PAGE_SIZE);
  };
  /**
   * Sélectionne `id` au niveau `depth` (0 = catégorie) ; `null` remonte au niveau parent.
   * Choisir une catégorie quitte la marque en cours (et inversement, voir pickBrand).
   */
  const pickNode = (depth: number, id: string | null) => {
    setQuery("");
    setBrand(null);
    setPath((prev) => (id ? [...prev.slice(0, depth), id] : prev.slice(0, depth)));
    setLimit(PAGE_SIZE);
  };

  // ── Yeux 👁️ ──────────────────────────────────────────────────────
  // Visible(produit) = exception individuelle si elle existe, sinon l'état de l'œil global.
  // Basculer l'œil global efface toutes les exceptions : retour à un état cohérent.
  const [globalOn, setGlobalOn] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});

  const toggleGlobal = () => {
    setGlobalOn((v) => !v);
    setOverrides({});
  };
  const toggleOne = useCallback((id: string, next: boolean) => {
    setOverrides((prev) => ({ ...prev, [id]: next }));
  }, []);

  // ── Résultats (filtres combinables + compteurs) ───────────────────
  const haystacks = useMemo(() => items.map(haystackOf), [items]);
  const tokens = useMemo(() => tokensOf(deferredQuery), [deferredQuery]);

  const searched = useMemo(
    () => (tokens.length ? items.filter((_, i) => matchesAll(haystacks[i], tokens)) : items),
    [items, haystacks, tokens],
  );
  const filterNode = trail[trail.length - 1] ?? null;
  const inCategory = useCallback(
    (i: CatalogItem) => !filterNode || inNode(i.collections, filterNode),
    [filterNode],
  );
  const results = useMemo(
    () => searched.filter((i) => (!brand || i.brand === brand) && inCategory(i)),
    [searched, brand, inCategory],
  );
  // ── Tri par catégories, dans l'ordre du menu ──────────────────────
  // Chaque produit est rangé dans la première « feuille » du menu (dans la catégorie affichée) qui le
  // contient : Café en Grains › Mécafé 1kg, puis Mécafé 250g, puis Kimbo… Les promotions passent après
  // les vraies catégories (un pack en promo reste rangé avec son café). Le reste va dans « Autres ».
  const leaves = useMemo(() => {
    const regular: { node: MenuNode; crumbs: MenuNode[] }[] = [];
    const promos: typeof regular = [];
    const walk = (nodes: MenuNode[], crumbs: MenuNode[], promo: boolean) => {
      for (const n of nodes) {
        const isPromo = promo || /promo/i.test(n.title);
        if (n.children.length) walk(n.children, [...crumbs, n], isPromo);
        else (isPromo ? promos : regular).push({ node: n, crumbs });
      }
    };
    walk(filterNode ? [filterNode] : menu, [], false);
    return [...regular, ...promos];
  }, [menu, filterNode]);

  // Un produit n'apparaît qu'une fois. S'il est dans plusieurs groupes, il va dans le plus précis
  // (celui qui contient le moins de produits) : Pack Dégustation → Mécafé 250g, sauces → Sauces.
  // Les promotions ne servent de groupe qu'aux produits qui ne sont dans aucune autre catégorie.
  const leafSizes = useMemo(
    () => leaves.map((l) => items.filter((it) => inNode(it.collections, l.node)).length),
    [leaves, items],
  );
  const positions = useMemo(() => {
    const m = new Map<string, Map<string, number>>();
    for (const [handle, ids] of Object.entries(order)) m.set(handle, new Map(ids.map((id, i) => [id, i])));
    return m;
  }, [order]);
  /** Rang du produit dans le groupe : ordre de la première collection du groupe qui le contient. */
  const rankIn = (it: CatalogItem, k: number): number => {
    const leaf = leaves[k];
    if (!leaf) return Infinity;
    for (const h of leaf.node.handles) {
      const pos = positions.get(h)?.get(it.productId);
      if (pos !== undefined) return pos;
    }
    return Infinity;
  };

  const sorted = useMemo(() => {
    const promoStart = leaves.findIndex((l) => /promo/i.test([...l.crumbs, l.node].map((n) => n.title).join(" ")));
    const keyed = results.map((it, i) => {
      const ks = leaves.flatMap((l, k) => (inNode(it.collections, l.node) ? [k] : []));
      const regular = promoStart === -1 ? ks : ks.filter((k) => k < promoStart);
      const pool = regular.length ? regular : ks;
      const k = pool.length ? pool.reduce((best, k) => (leafSizes[k] < leafSizes[best] ? k : best)) : leaves.length;
      return { it, i, k, r: rankIn(it, k) };
    });
    // Groupes dans l'ordre du menu ; dans un groupe, ordre de la collection sur le site
    // (les formats d'un même produit restent ensemble, du moins cher au plus cher).
    keyed.sort((a, b) => a.k - b.k || (a.r === b.r ? 0 : a.r < b.r ? -1 : 1) || a.i - b.i);
    return keyed;
  }, [results, leaves, leafSizes, positions]);
  const groupSizes = useMemo(() => {
    const m = new Map<number, number>();
    for (const { k } of sorted) m.set(k, (m.get(k) ?? 0) + 1);
    return m;
  }, [sorted]);
  const groupLabel = (k: number) => {
    const leaf = leaves[k];
    if (!leaf) return { crumb: "", title: "Autres" };
    // Le fil d'Ariane omet la catégorie déjà sélectionnée.
    const crumbs = leaf.crumbs.filter((c) => c.id !== filterNode?.id);
    return { crumb: crumbs.map((c) => c.title).join(" › "), title: leaf.node.title };
  };
  /** Titre de groupe : seulement s'il y a plusieurs groupes à l'écran. */
  const showGroups = groupSizes.size > 1 || (groupSizes.size === 1 && leaves[sorted[0]?.k]?.node.id !== filterNode?.id);
  const renderGroupHead = (k: number, list: boolean) => {
    const { crumb, title } = groupLabel(k);
    return (
      <div className={list ? "list-group" : "group-head"} role={list ? "row" : undefined}>
        <span className="group-titles">
          {crumb && <span className="group-crumb">{crumb}</span>}
          <span className="group-name">{title}</span>
        </span>
        <span className="group-count">{plural(groupSizes.get(k) ?? 0, "produit")}</span>
      </div>
    );
  };

  // Nombre total de produits de chaque marque (un clic sur une marque montre toute la marque).
  const brandFacets: Facet[] = useMemo(() => {
    const counts = countBy(searched, "brand");
    return brands.map((name) => ({ name, count: counts.get(name) ?? 0 }));
  }, [searched, brands]);
  // Nombre total de produits de chaque catégorie (un clic sur une catégorie quitte la marque).
  const countIn = (node: MenuNode) => searched.filter((i) => inNode(i.collections, node)).length;
  const allCount = searched.length;
  const allCatCount = searched.length;

  // ── Chargement progressif ─────────────────────────────────────────
  const sentinel = useRef<HTMLDivElement>(null);
  const hasMore = limit < sorted.length;
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasMore) return;
    const io = new IntersectionObserver(
      (entries) => entries[0]?.isIntersecting && setLimit((l) => l + PAGE_SIZE),
      { rootMargin: "800px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, limit]);

  // ── Vue grille / liste (la liste n'existe que sur écran large) ────
  const [view, setView] = useState<"grid" | "list">("grid");
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 900px)");
    const sync = () => setWide(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    try {
      if (localStorage.getItem("mecafe:view") === "list") setView("list");
    } catch {}
    return () => mq.removeEventListener("change", sync);
  }, []);
  const changeView = (v: "grid" | "list") => {
    setView(v);
    try {
      localStorage.setItem("mecafe:view", v);
    } catch {}
  };
  const effectiveView = wide ? view : "grid";

  // ── Raccourci « / » : aller à la recherche ────────────────────────
  const searchInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
      if (e.key === "/" && !typing && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        searchInput.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ── URL partageable (?q=…&marque=…&categorie=…) ───────────────────
  useEffect(() => {
    const p = new URLSearchParams();
    if (query.trim()) p.set("q", query.trim());
    if (brand) p.set("marque", slug(brand));
    if (path.length) p.set("categorie", path.join("/"));
    const qs = p.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }, [query, brand, path]);

  const resetFilters = () => {
    setQuery("");
    setBrand(null);
    setPath([]);
    setLimit(PAGE_SIZE);
  };
  const filtered = Boolean(query.trim() || brand || path.length);
  const visible = sorted.slice(0, limit);
  const showStock = items.some((i) => i.stock !== undefined); // présent seulement pour l'administrateur

  /**
   * Entrée de catégorie. Niveau 0 : puce de la rangée principale. Niveaux suivants : visibles
   * seulement sur bureau, indentés sous l'entrée ouverte (sur mobile, voir les rangées .sub-rail).
   */
  const renderNode = (node: MenuNode, depth: number): React.ReactNode => {
    const count = countIn(node);
    const open = path[depth] === node.id;
    const selected = open && path.length === depth + 1;
    return (
      <Fragment key={node.id}>
        <button
          type="button"
          className={depth === 0 ? "cat-chip" : `cat-chip sub-chip sub-inline depth-${depth}`}
          aria-pressed={selected}
          data-open={open}
          data-empty={count === 0}
          onClick={() => pickNode(depth, selected ? null : node.id)}
        >
          {node.title}
          <span className="chip-count">{count}</span>
        </button>
        {open && node.children.map((child) => renderNode(child, depth + 1))}
      </Fragment>
    );
  };

  const logout = async () => {
    await fetch("/api/logout", { method: "POST" });
    window.location.href = "/login";
  };

  return (
    <>
      {source === "demo" && <div className="demo-banner">Mode démonstration — données fictives</div>}

      <header className="appbar">
        <div className="appbar-inner">
          <a href="/" className="appbar-logo" aria-label="Mécafé — accueil">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/mecafe-logo-sm.png" alt="Mécafé" width={480} height={156} />
          </a>
          <span className="appbar-title">Tarifs professionnels</span>
          <div className="appbar-search">
            <SearchField value={query} onChange={changeQuery} inputRef={searchInput} />
          </div>
          <div className="appbar-actions">
            <GlobalEye on={globalOn} onToggle={toggleGlobal} />
            <button type="button" className="logout-btn" onClick={logout} title="Se déconnecter">
              <LogoutIcon size={18} />
              <span className="logout-label">Se déconnecter</span>
            </button>
          </div>
        </div>
      </header>

      <main className="container layout">
        <aside className="filters" aria-label="Filtres">
          <h2 className="side-label">Marques</h2>
          <nav aria-label="Marques" className="rail brand-rail">
            <button type="button" className="brand-tile" aria-pressed={brand === null} onClick={() => pickBrand(null)}>
              <span className="brand-badge brand-badge-all" aria-hidden="true">
                Tous
              </span>
              <span className="brand-tile-name">
                Toutes <span className="brand-tile-count">{allCount}</span>
              </span>
            </button>
            {brandFacets.map((f) => (
              <button
                key={f.name}
                type="button"
                className="brand-tile"
                aria-pressed={brand === f.name}
                data-empty={f.count === 0}
                onClick={() => pickBrand(brand === f.name ? null : f.name)}
              >
                <BrandBadge brand={f.name} />
                <span className="brand-tile-name">
                  {f.name} <span className="brand-tile-count">{f.count}</span>
                </span>
              </button>
            ))}
          </nav>

          <h2 className="side-label">Catégories</h2>
          <nav aria-label="Catégories" className="rail cat-rail">
            <button type="button" className="cat-chip" aria-pressed={path.length === 0} onClick={() => pickNode(0, null)}>
              Toutes catégories
              <span className="chip-count">{allCatCount}</span>
            </button>
            {menu.map((node) => renderNode(node, 0))}
          </nav>

          {/* Mobile / tablette : un rang de puces par niveau ouvert */}
          {trail.map((node, depth) =>
            node.children.length > 0 ? (
              <nav key={node.id} aria-label={`Sous-catégories : ${node.title}`} className="rail sub-rail">
                <button
                  type="button"
                  className="cat-chip sub-chip"
                  aria-pressed={path.length === depth + 1}
                  onClick={() => pickNode(depth + 1, null)}
                >
                  Tout {node.title}
                </button>
                {node.children.map((child) => {
                  const n = countIn(child);
                  return (
                    <button
                      key={child.id}
                      type="button"
                      className="cat-chip sub-chip"
                      aria-pressed={path[depth + 1] === child.id}
                      data-empty={n === 0}
                      onClick={() => pickNode(depth + 1, path[depth + 1] === child.id ? null : child.id)}
                    >
                      {child.title}
                      <span className="chip-count">{n}</span>
                    </button>
                  );
                })}
              </nav>
            ) : null,
          )}
        </aside>

        <section className="results" aria-label="Produits">
        <div className="result-bar" aria-live="polite">
          <span className="result-count">
            <strong>{results.length}</strong> produit{results.length > 1 ? "s" : ""}
            {brand && <span className="result-tag">{brand}</span>}
            {catNode && <span className="result-tag">{trail.map((n) => n.title).join(" › ")}</span>}
          </span>
          <span className="result-actions">
            {filtered && (
              <button type="button" className="link-btn" onClick={resetFilters}>
                Réinitialiser
              </button>
            )}
            <span className="view-toggle" role="group" aria-label="Affichage">
              <button type="button" aria-pressed={view === "grid"} onClick={() => changeView("grid")} title="Grille">
                <GridIcon size={16} />
                <span>Grille</span>
              </button>
              <button type="button" aria-pressed={view === "list"} onClick={() => changeView("list")} title="Liste">
                <ListIcon size={16} />
                <span>Liste</span>
              </button>
            </span>
          </span>
        </div>

        {results.length === 0 ? (
          <div className="empty">
            <SearchIcon size={28} />
            <p>Aucun produit ne correspond à votre recherche.</p>
            <button type="button" className="btn btn-ghost" onClick={resetFilters}>
              Effacer les filtres
            </button>
          </div>
        ) : effectiveView === "list" ? (
          <div className={`list ${showStock ? "with-stock" : ""}`} role="table" aria-label="Liste des produits">
            <div className="list-head" role="row">
              <span role="columnheader" />
              <span role="columnheader">Produit</span>
              <span role="columnheader">Format</span>
              {showStock && <span role="columnheader">Stock</span>}
              <span role="columnheader" className="num">
                Prix site
              </span>
              <span role="columnheader" className="num">
                Prix commercial
              </span>
            </div>
            {visible.map(({ it: item, k }, i) => (
              <Fragment key={item.id}>
                {showGroups && k !== visible[i - 1]?.k && renderGroupHead(k, true)}
                <ProductRow
                  item={item}
                  commercial={prices[item.id]}
                  revealed={overrides[item.id] ?? globalOn}
                  onToggle={toggleOne}
                />
              </Fragment>
            ))}
          </div>
        ) : (
          <div className="grid">
            {visible.map(({ it: item, k }, i) => (
              <Fragment key={item.id}>
                {showGroups && k !== visible[i - 1]?.k && renderGroupHead(k, false)}
                <ProductCard
                  item={item}
                  commercial={prices[item.id]}
                  revealed={overrides[item.id] ?? globalOn}
                  onToggle={toggleOne}
                />
              </Fragment>
            ))}
          </div>
        )}
        {hasMore && <div ref={sentinel} className="sentinel" aria-hidden="true" />}
        </section>
      </main>

      {/* Barre du bas, toujours visible */}
      <footer className="footer">
        <div className="footer-inner">
          <p className="footer-note">© {new Date().getFullYear()}, TARIFS MÉCAFÉ - synchronisés avec mecafe.ma</p>
          {isAdmin && (
            <Link href="/admin" className="footer-link">
              <SettingsIcon size={15} /> Administration
            </Link>
          )}
        </div>
      </footer>
    </>
  );
}
