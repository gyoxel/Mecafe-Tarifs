"use client";

import Link from "next/link";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { CATEGORY_ORDER } from "@/lib/config";
import { fold, slug } from "@/lib/format";
import { haystackOf, matchesAll, tokensOf } from "@/lib/search";
import type { CatalogItem, CatalogSource, PriceMap } from "@/lib/types";
import { CloseIcon, EyeIcon, SearchIcon } from "./Icons";
import { ProductCard } from "./ProductCard";

const PAGE_SIZE = 60;

type Props = {
  items: CatalogItem[];
  prices: PriceMap;
  source: CatalogSource;
  isAdmin: boolean;
  initial: { q: string; brand: string; category: string };
};

type Facet = { name: string; count: number };

function countBy(list: CatalogItem[], key: "brand" | "category"): Map<string, number> {
  const m = new Map<string, number>();
  for (const it of list) m.set(it[key], (m.get(it[key]) ?? 0) + 1);
  return m;
}

function GlobalEye({ on, onToggle, className }: { on: boolean; onToggle: () => void; className: string }) {
  return (
    <button
      type="button"
      className={className}
      aria-pressed={on}
      onClick={onToggle}
      title={on ? "Masquer tous les prix commerciaux" : "Afficher tous les prix commerciaux"}
    >
      <EyeIcon off={!on} size={20} />
      <span className="global-eye-label">Tarifs commerciaux</span>
    </button>
  );
}

export function Catalog({ items, prices, source, isAdmin, initial }: Props) {
  // ── Filtres ───────────────────────────────────────────────────────
  const brands = useMemo(() => [...new Set(items.map((i) => i.brand))], [items]);
  const categories = useMemo(() => {
    const all = [...new Set(items.map((i) => i.category))];
    const rank = (c: string) => {
      const i = CATEGORY_ORDER.findIndex((o) => fold(o) === fold(c));
      return i === -1 ? CATEGORY_ORDER.length : i;
    };
    return all.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b, "fr"));
  }, [items]);

  const [query, setQuery] = useState(initial.q);
  const [brand, setBrand] = useState<string | null>(() => brands.find((b) => slug(b) === initial.brand) ?? null);
  const [category, setCategory] = useState<string | null>(
    () => categories.find((c) => slug(c) === initial.category) ?? null,
  );
  const [limit, setLimit] = useState(PAGE_SIZE);
  const deferredQuery = useDeferredValue(query);

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

  // ── Calcul des résultats (filtres combinables + compteurs) ────────
  const haystacks = useMemo(() => items.map(haystackOf), [items]);
  const tokens = useMemo(() => tokensOf(deferredQuery), [deferredQuery]);

  const searched = useMemo(
    () => (tokens.length ? items.filter((_, i) => matchesAll(haystacks[i], tokens)) : items),
    [items, haystacks, tokens],
  );
  const results = useMemo(
    () => searched.filter((i) => (!brand || i.brand === brand) && (!category || i.category === category)),
    [searched, brand, category],
  );

  const brandFacets: Facet[] = useMemo(() => {
    const counts = countBy(searched.filter((i) => !category || i.category === category), "brand");
    return brands.map((name) => ({ name, count: counts.get(name) ?? 0 }));
  }, [searched, brands, category]);
  const categoryFacets: Facet[] = useMemo(() => {
    const counts = countBy(searched.filter((i) => !brand || i.brand === brand), "category");
    return categories.map((name) => ({ name, count: counts.get(name) ?? 0 }));
  }, [searched, categories, brand]);

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

  // ── URL partageable (?q=…&marque=…&categorie=…) ───────────────────
  useEffect(() => {
    const p = new URLSearchParams();
    if (query.trim()) p.set("q", query.trim());
    if (brand) p.set("marque", slug(brand));
    if (category) p.set("categorie", slug(category));
    const qs = p.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }, [query, brand, category]);

  const resetFilters = () => {
    setQuery("");
    setBrand(null);
    setCategory(null);
    setLimit(PAGE_SIZE);
  };
  const filtered = Boolean(query.trim() || brand || category);
  const visible = results.slice(0, limit);

  const logout = async () => {
    await fetch("/api/logout", { method: "POST" });
    window.location.href = "/login";
  };

  return (
    <>
      {source === "demo" && (
        <div className="demo-banner">Mode démonstration — données fictives</div>
      )}

      <header className="hero">
        <h1 className="wordmark">MÉCAFÉ</h1>
        <p className="tagline">Tarifs professionnels</p>
        {/* Mobile : le contrôle est libellé ici ; la barre collante n'affiche que l'œil. */}
        <GlobalEye on={globalOn} onToggle={toggleGlobal} className="global-eye in-hero" />
      </header>

      <div className="toolbar">
        <div className="toolbar-inner">
          <label className="search">
            <SearchIcon className="search-icon" />
            <input
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setLimit(PAGE_SIZE);
              }}
              placeholder="Rechercher un produit..."
              aria-label="Rechercher un produit"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              enterKeyHint="search"
            />
            {query && (
              <button type="button" className="search-clear" aria-label="Effacer la recherche" onClick={() => setQuery("")}>
                <CloseIcon />
              </button>
            )}
          </label>

          <GlobalEye on={globalOn} onToggle={toggleGlobal} className="global-eye in-toolbar" />
        </div>
      </div>

      <main className="container">
        <nav aria-label="Marques" className="facet-row brands">
          <button
            type="button"
            className="brand-chip"
            aria-pressed={brand === null}
            onClick={() => {
              setBrand(null);
              setLimit(PAGE_SIZE);
            }}
          >
            Toutes
          </button>
          {brandFacets.map((f) => (
            <button
              key={f.name}
              type="button"
              className="brand-chip"
              aria-pressed={brand === f.name}
              data-empty={f.count === 0}
              onClick={() => {
                setBrand(brand === f.name ? null : f.name);
                setLimit(PAGE_SIZE);
              }}
            >
              {f.name}
              <span className="chip-count">{f.count}</span>
            </button>
          ))}
        </nav>

        <nav aria-label="Catégories" className="facet-row categories">
          <button
            type="button"
            className="cat-chip"
            aria-pressed={category === null}
            onClick={() => {
              setCategory(null);
              setLimit(PAGE_SIZE);
            }}
          >
            Toutes catégories
          </button>
          {categoryFacets.map((f) => (
            <button
              key={f.name}
              type="button"
              className="cat-chip"
              aria-pressed={category === f.name}
              data-empty={f.count === 0}
              onClick={() => {
                setCategory(category === f.name ? null : f.name);
                setLimit(PAGE_SIZE);
              }}
            >
              {f.name}
              <span className="chip-count">{f.count}</span>
            </button>
          ))}
        </nav>

        <div className="result-bar" aria-live="polite">
          <span>
            {results.length} produit{results.length > 1 ? "s" : ""}
          </span>
          {filtered && (
            <button type="button" className="link-btn" onClick={resetFilters}>
              Réinitialiser
            </button>
          )}
        </div>

        {results.length === 0 ? (
          <div className="empty">
            <p>Aucun produit ne correspond à votre recherche.</p>
            <button type="button" className="link-btn" onClick={resetFilters}>
              Effacer les filtres
            </button>
          </div>
        ) : (
          <div className="grid">
            {visible.map((item) => (
              <ProductCard
                key={item.id}
                item={item}
                commercial={prices[item.id]}
                revealed={overrides[item.id] ?? globalOn}
                onToggle={toggleOne}
              />
            ))}
          </div>
        )}
        {hasMore && <div ref={sentinel} className="sentinel" aria-hidden="true" />}
      </main>

      <footer className="footer">
        <span>Prix et produits synchronisés avec mecafe.ma</span>
        <span className="footer-links">
          {isAdmin && <Link href="/admin">Administration</Link>}
          <button type="button" className="link-btn" onClick={logout}>
            Se déconnecter
          </button>
        </span>
      </footer>
    </>
  );
}
