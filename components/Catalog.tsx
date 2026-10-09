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

export function Catalog({ items, prices, source, menu, isAdmin, initial }: Props) {
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
  const pickBrand = (b: string | null) => {
    setQuery("");
    setBrand(b);
    setLimit(PAGE_SIZE);
  };
  /** Sélectionne `id` au niveau `depth` (0 = catégorie) ; `null` remonte au niveau parent. */
  const pickNode = (depth: number, id: string | null) => {
    setQuery("");
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
  const resultsByBrand = useMemo(() => countBy(results, "brand"), [results]);

  const brandFacets: Facet[] = useMemo(() => {
    const counts = countBy(searched.filter(inCategory), "brand");
    return brands.map((name) => ({ name, count: counts.get(name) ?? 0 }));
  }, [searched, brands, inCategory]);
  const ofBrand = useMemo(() => searched.filter((i) => !brand || i.brand === brand), [searched, brand]);
  const countIn = (node: MenuNode) => ofBrand.filter((i) => inNode(i.collections, node)).length;
  const allCount = useMemo(() => searched.filter(inCategory).length, [searched, inCategory]);
  const allCatCount = ofBrand.length;

  // ── Chargement progressif ─────────────────────────────────────────
  const sentinel = useRef<HTMLDivElement>(null);
  const hasMore = limit < results.length;
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
  const visible = results.slice(0, limit);
  const grouped = !brand; // titres de marque dans la grille quand plusieurs marques sont listées
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
          <GlobalEye on={globalOn} onToggle={toggleGlobal} />
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
            {visible.map((item, i) => (
              <Fragment key={item.id}>
                {grouped && item.brand !== visible[i - 1]?.brand && (
                  <div className="list-group" role="row" style={{ "--brand": brandStyle(item.brand).color } as React.CSSProperties}>
                    <BrandBadge brand={item.brand} className="brand-badge-xs" />
                    <span className="group-name">{item.brand}</span>
                    <span className="group-count">{plural(resultsByBrand.get(item.brand) ?? 0, "produit")}</span>
                  </div>
                )}
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
            {visible.map((item, i) => (
              <Fragment key={item.id}>
                {grouped && item.brand !== visible[i - 1]?.brand && (
                  <div className="group-head" style={{ "--brand": brandStyle(item.brand).color } as React.CSSProperties}>
                    <BrandBadge brand={item.brand} className="brand-badge-sm" />
                    <span className="group-name">{item.brand}</span>
                    <span className="group-count">{plural(resultsByBrand.get(item.brand) ?? 0, "produit")}</span>
                  </div>
                )}
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

      <footer className="footer">
        <div className="footer-inner">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <p className="footer-note">Mécafé · usage interne · prix site synchronisés avec mecafe.ma</p>
          <div className="footer-links">
            {isAdmin && (
              <Link href="/admin" className="footer-link">
                <SettingsIcon size={16} /> Administration
              </Link>
            )}
            <button type="button" className="footer-link" onClick={logout}>
              <LogoutIcon size={16} /> Se déconnecter
            </button>
          </div>
        </div>
      </footer>
    </>
  );
}
