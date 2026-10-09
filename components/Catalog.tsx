"use client";

import Link from "next/link";
import { Fragment, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { CATEGORY_ORDER } from "@/lib/config";
import { fold, slug } from "@/lib/format";
import { haystackOf, matchesAll, tokensOf } from "@/lib/search";
import type { CatalogItem, CatalogSource, PriceMap } from "@/lib/types";
import { brandStyle } from "@/lib/brands";
import { BrandBadge } from "./BrandLogo";
import { CloseIcon, EyeIcon, LogoutIcon, SearchIcon, SettingsIcon } from "./Icons";
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

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? "s" : ""}`;

/** Champ de recherche. */
function SearchField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label className="search">
      <SearchIcon className="search-icon" size={18} />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Rechercher un produit..."
        aria-label="Rechercher un produit"
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        enterKeyHint="search"
      />
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

  const changeQuery = (v: string) => {
    setQuery(v);
    setLimit(PAGE_SIZE);
  };
  const pickBrand = (b: string | null) => {
    setBrand(b);
    setLimit(PAGE_SIZE);
  };
  const pickCategory = (c: string | null) => {
    setCategory(c);
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
  const results = useMemo(
    () => searched.filter((i) => (!brand || i.brand === brand) && (!category || i.category === category)),
    [searched, brand, category],
  );
  const resultsByBrand = useMemo(() => countBy(results, "brand"), [results]);

  const brandFacets: Facet[] = useMemo(() => {
    const counts = countBy(searched.filter((i) => !category || i.category === category), "brand");
    return brands.map((name) => ({ name, count: counts.get(name) ?? 0 }));
  }, [searched, brands, category]);
  const categoryFacets: Facet[] = useMemo(() => {
    const counts = countBy(searched.filter((i) => !brand || i.brand === brand), "category");
    return categories.map((name) => ({ name, count: counts.get(name) ?? 0 }));
  }, [searched, categories, brand]);
  const allCount = useMemo(
    () => searched.filter((i) => !category || i.category === category).length,
    [searched, category],
  );
  const allCatCount = useMemo(() => searched.filter((i) => !brand || i.brand === brand).length, [searched, brand]);

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
  const grouped = !brand; // titres de marque dans la grille quand plusieurs marques sont listées

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
            <SearchField value={query} onChange={changeQuery} />
          </div>
          <GlobalEye on={globalOn} onToggle={toggleGlobal} />
        </div>
      </header>

      <main className="container">
        <section className="filters" aria-label="Filtres">
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

          <nav aria-label="Catégories" className="rail cat-rail">
            <button type="button" className="cat-chip" aria-pressed={category === null} onClick={() => pickCategory(null)}>
              Toutes catégories
              <span className="chip-count">{allCatCount}</span>
            </button>
            {categoryFacets.map((f) => (
              <button
                key={f.name}
                type="button"
                className="cat-chip"
                aria-pressed={category === f.name}
                data-empty={f.count === 0}
                onClick={() => pickCategory(category === f.name ? null : f.name)}
              >
                {f.name}
                <span className="chip-count">{f.count}</span>
              </button>
            ))}
          </nav>
        </section>

        <div className="result-bar" aria-live="polite">
          <span className="result-count">
            <strong>{results.length}</strong> produit{results.length > 1 ? "s" : ""}
            {brand && <span className="result-tag">{brand}</span>}
            {category && <span className="result-tag">{category}</span>}
          </span>
          {filtered && (
            <button type="button" className="link-btn" onClick={resetFilters}>
              Réinitialiser
            </button>
          )}
        </div>

        {results.length === 0 ? (
          <div className="empty">
            <SearchIcon size={28} />
            <p>Aucun produit ne correspond à votre recherche.</p>
            <button type="button" className="btn btn-ghost" onClick={resetFilters}>
              Effacer les filtres
            </button>
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
