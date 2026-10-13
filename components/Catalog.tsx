"use client";

import Link from "next/link";
import { Fragment, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
  CLIENT_STORAGE_KEY,
  KIND_STORAGE_KEY,
  QTY_MAX,
  readCart,
  readEditing,
  resolveCart,
  writeCart,
  writeEditing,
  type CartEditing,
  type CartLine,
} from "@/lib/cart";
import { KIND_THE, isDocKind, kindOfNumber, type DocKind, type Draft, type SavedInvoice } from "@/lib/invoice-types";
import { slug } from "@/lib/format";
import { groupItems, menuLeaves } from "@/lib/groups";
import { inNode, resolvePath, type MenuNode } from "@/lib/menu";
import { haystackOf, matchesAll, tokensOf } from "@/lib/search";
import type { CatalogItem, CatalogSource } from "@/lib/types";
import {
  BASE_ID,
  BASE_NAME,
  NAME_MAX,
  OPTION_STORAGE_KEY,
  defaultOption,
  isBase,
  pricesFor,
  type OptionPrices,
  type PriceOption,
} from "@/lib/options";
import { parsePrice } from "@/lib/csv";
import { CartFab, CartPanel, CartSheet } from "./Cart";
import { InvoiceModal, PrintInvoice, docOf, printDoc, type InvoiceDoc } from "./Invoice";
import { OptionPicker } from "./OptionPicker";
import { brandStyle } from "@/lib/brands";
import { BrandBadge } from "./BrandLogo";
import { CheckIcon, CloseIcon, DownloadIcon, EyeIcon, FileTextIcon, UsersIcon, GridIcon, ListIcon, LockIcon, LogoutIcon, SearchIcon, SettingsIcon } from "./Icons";
import { ProductCard, type PriceEditProps } from "./ProductCard";
import { ProductRow } from "./ProductRow";

const PAGE_SIZE = 60;

type Props = {
  items: CatalogItem[];
  source: CatalogSource;
  /** Catégories = menu Shopify (niveau 1) et sous-catégories (niveau 2). */
  menu: MenuNode[];
  /** Ordre des produits dans chaque collection (handle → ids produits), comme sur le site. */
  order: Record<string, string[]>;
  initial: { q: string; brand: string; path: string[] };
  /**
   * Espace admin : commerciaux et leurs prix saisis (+ stock dans `items`).
   * Absent = catalogue public : prix du site seulement, rien sur les prix commerciaux.
   */
  admin?: {
    prices: OptionPrices;
    options: PriceOption[];
    /** Facture à modifier (lien « Modifier » de l'historique) : remise dans le panier à l'arrivée. */
    edit?: SavedInvoice | null;
    /** Production sans base de données : rien ne peut être enregistré. */
    storageDown?: boolean;
  };
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
  placeholder,
}: {
  placeholder: string;
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
        placeholder={placeholder}
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
      title={on ? "Masquer tous les prix revendeurs" : "Afficher tous les prix revendeurs"}
    >
      <EyeIcon off={!on} size={18} />
      <span className="global-eye-label">Tarifs revendeurs</span>
      <span className="switch" aria-hidden="true">
        <span className="switch-thumb" />
      </span>
    </button>
  );
}

export function Catalog({ items, source, menu, order, initial, admin }: Props) {
  // ── Admin : revendeur affiché. Par défaut « Revendeur » (la base) ; le choix est mémorisé sur l'appareil
  // (remis à la base à chaque connexion, voir LoginForm).
  const isAdmin = Boolean(admin);
  const options = admin?.options ?? [];
  const [option, setOption] = useState<string | null>(() => defaultOption(admin?.options ?? [])?.id ?? null);
  useEffect(() => {
    if (!admin) return;
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(OPTION_STORAGE_KEY);
    } catch {}
    // Modification d'une facture : son revendeur d'origine, s'il existe encore.
    const fromEdit = admin.edit?.commercialId;
    if (fromEdit && admin.options.some((o) => o.id === fromEdit)) setOption(fromEdit);
    else if (saved && admin.options.some((o) => o.id === saved)) setOption(saved);
  }, [admin]);
  const pickCommercial = (o: PriceOption) => {
    if (o.id !== option && !discardPriceDrafts()) return;
    setOption(o.id);
    try {
      localStorage.setItem(OPTION_STORAGE_KEY, o.id);
    } catch {}
  };
  // Prix du revendeur choisi : ceux saisis produit par produit (sans prix saisi : pas de prix revendeur).
  const currentOption = options.find((o) => o.id === option);
  // Prix enregistrés (mis à jour sur place après une modification au crayon).
  const [optionPrices, setOptionPrices] = useState<OptionPrices | undefined>(admin?.prices);
  useEffect(() => setOptionPrices(admin?.prices), [admin?.prices]);
  const prices = useMemo(
    () => (currentOption && optionPrices ? pricesFor(currentOption, optionPrices, items) : {}),
    [currentOption, optionPrices, items],
  );
  const proLabel = currentOption?.name ?? "Revendeur";

  // ── Prix revendeur modifié depuis le catalogue (crayon) ──────────
  // Valeurs en attente par produit ; la barre flottante les enregistre toutes d'un coup pour le revendeur affiché.
  const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>({});
  const [priceSaving, setPriceSaving] = useState(false);
  const [priceMsg, setPriceMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const priceText = (n: number | undefined) => (n == null ? "" : String(n).replace(".", ","));
  const pricesRef = useRef(prices);
  pricesRef.current = prices;
  const startPriceEdit = useCallback((id: string) => {
    setPriceMsg(null);
    setPriceDrafts((d) => (id in d ? d : { ...d, [id]: priceText(pricesRef.current[id]) }));
  }, []);
  const changePriceDraft = useCallback((id: string, text: string) => setPriceDrafts((d) => ({ ...d, [id]: text })), []);
  const cancelPriceDraft = useCallback(
    (id: string) =>
      setPriceDrafts((d) => {
        const { [id]: _drop, ...rest } = d;
        return rest;
      }),
    [],
  );
  // Ce qui changera vraiment : vide = effacer le prix saisi (le revendeur suit alors son modèle ; Prix Gros : « — »).
  const own = (currentOption && optionPrices?.[currentOption.id]) || {};
  const priceChanges = Object.entries(priceDrafts).flatMap<{ variantId: string; price: number | null }>(([id, text]) => {
    const target = parsePrice(text);
    if (target === null) return own[id] != null ? [{ variantId: id, price: null }] : [];
    if (Number.isNaN(target) || target === prices[id]) return [];
    return [{ variantId: id, price: target }];
  });
  const priceInvalid = Object.values(priceDrafts).filter((t) => Number.isNaN(parsePrice(t))).length;
  const priceDraftCount = Object.keys(priceDrafts).length;
  const changedSet = new Set(priceChanges.map((c) => c.variantId));
  function discardPriceDrafts(): boolean {
    if (!priceDraftCount) return true;
    if (priceChanges.length && !window.confirm("Les prix modifiés non enregistrés seront perdus. Continuer ?")) return false;
    setPriceDrafts({});
    return true;
  }
  useEffect(() => {
    if (!priceChanges.length) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [priceChanges.length]);
  const savePriceDrafts = async () => {
    if (!currentOption || priceSaving || priceInvalid) return;
    if (!priceChanges.length) return setPriceDrafts({});
    setPriceSaving(true);
    setPriceMsg(null);
    try {
      const res = await fetch("/api/admin/prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ option: currentOption.id, updates: priceChanges }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? `Erreur ${res.status}`);
      setOptionPrices((prev) => {
        const next = { ...(prev?.[currentOption.id] ?? {}) };
        for (const c of priceChanges) {
          if (c.price == null) delete next[c.variantId];
          else next[c.variantId] = c.price;
        }
        return { ...prev, [currentOption.id]: next };
      });
      setPriceDrafts({});
      const n = priceChanges.length;
      setPriceMsg({ kind: "ok", text: `${n} prix enregistré${n > 1 ? "s" : ""} pour ${currentOption.name}.` });
    } catch (e) {
      setPriceMsg({ kind: "error", text: e instanceof Error ? e.message : "Échec de l'enregistrement" });
    }
    setPriceSaving(false);
  };
  useEffect(() => {
    if (priceMsg?.kind !== "ok") return;
    const t = setTimeout(() => setPriceMsg(null), 2500);
    return () => clearTimeout(t);
  }, [priceMsg]);
  const canEditPrices = Boolean(admin && currentOption && !admin.storageDown);
  // Même objet pour tous les produits sans saisie en cours : les cartes non touchées ne se redessinent pas.
  const idleEdit = useMemo<PriceEditProps>(
    () => ({ draft: undefined, invalid: false, changed: false, onStart: startPriceEdit, onDraft: changePriceDraft, onCancel: cancelPriceDraft }),
    [startPriceEdit, changePriceDraft, cancelPriceDraft],
  );
  const priceEditOf = (id: string): PriceEditProps | undefined => {
    if (!canEditPrices) return undefined;
    const draft = priceDrafts[id];
    if (draft === undefined) return idleEdit;
    return { ...idleEdit, draft, invalid: Number.isNaN(parsePrice(draft)), changed: changedSet.has(id) };
  };

  // ── Panier (admin seulement), mémorisé sur l'appareil ────────────
  const [cart, setCart] = useState<CartLine[]>([]);
  const cartRef = useRef(cart);
  cartRef.current = cart;
  const cartLoaded = useRef(false);
  // Facture confirmée remise dans le panier pour être modifiée (même n° à l'enregistrement).
  const [editing, setEditing] = useState<CartEditing | null>(null);
  useEffect(() => {
    if (!admin) return;
    let lines = readCart();
    let edit = readEditing();
    const inv = admin.edit;
    if (inv && edit?.id !== inv.id) {
      const replace =
        lines.length === 0 ||
        window.confirm(`Modifier ${KIND_THE[inv.kind]} ${inv.number} ? Le panier en cours sera remplacé.`);
      if (replace) {
        lines = inv.rows.map((r) => ({ id: r.variantId, qty: r.qty, ...(r.manual ? { price: r.unit } : {}) }));
        edit = { id: inv.id, number: inv.number };
        // Téléphone / tablette : le panier s'ouvre directement sur la facture à modifier.
        if (!window.matchMedia("(min-width: 1100px)").matches) setSheetOpen(true);
      }
    }
    setCart(lines);
    setEditing(lines.length ? edit : null);
    cartLoaded.current = true;
  }, [admin]);
  useEffect(() => {
    if (cartLoaded.current) writeCart(cart);
  }, [cart]);
  useEffect(() => {
    if (cartLoaded.current) writeEditing(editing);
  }, [editing]);
  // Devis ou commande (choisi en haut du panier, mémorisé sur l'appareil). En modification : celui du document,
  // qui ne change pas (son n° D… ou C… non plus).
  const [docKind, setDocKind] = useState<DocKind>("devis");
  useEffect(() => {
    if (!admin) return;
    try {
      const k = localStorage.getItem(KIND_STORAGE_KEY);
      if (isDocKind(k)) setDocKind(k);
    } catch {}
  }, [admin]);
  const pickKind = useCallback((k: DocKind) => {
    setDocKind(k);
    try {
      localStorage.setItem(KIND_STORAGE_KEY, k);
    } catch {}
  }, []);
  const kind: DocKind = editing ? kindOfNumber(editing.number) : docKind;

  // Prix Gros : nom du client pour ce devis (tapé dans le panier, sans l'ajouter aux revendeurs).
  const [clientName, setClientName] = useState("");
  useEffect(() => {
    if (!admin) return;
    try {
      const inv = admin.edit;
      // Devis Prix Gros remis dans le panier : son nom de client revient avec lui.
      if (inv && inv.commercialId === BASE_ID && inv.commercial !== BASE_NAME) setClientName(inv.commercial);
      else setClientName(localStorage.getItem(CLIENT_STORAGE_KEY) ?? "");
    } catch {}
  }, [admin]);
  const changeClientName = useCallback((name: string) => {
    const clean = name.trim().replace(/\s+/g, " ").slice(0, NAME_MAX);
    setClientName(clean);
    try {
      if (clean) localStorage.setItem(CLIENT_STORAGE_KEY, clean);
      else localStorage.removeItem(CLIENT_STORAGE_KEY);
    } catch {}
  }, []);
  const baseSelected = isBase(currentOption);
  const clearCart = () => {
    setCart([]);
    setEditing(null);
    changeClientName("");
  };
  const [lastAdded, setLastAdded] = useState<string | null>(null);
  const [bump, setBump] = useState(0); // relance l'animation du bouton panier à chaque ajout
  const [panelHidden, setPanelHidden] = useState(false); // bureau : panneau réduit par l'utilisateur
  const [sheetOpen, setSheetOpen] = useState(false); // mobile : grande fenêtre du panier
  const setCartQty = useCallback((id: string, qty: number) => {
    const q = Math.max(0, Math.min(qty, QTY_MAX));
    const prev = cartRef.current;
    const before = prev.find((l) => l.id === id)?.qty ?? 0;
    // Dernier article retiré : le panier est vide, plus de modification de facture en cours.
    if (q === 0 && before > 0 && prev.length === 1) setEditing(null);
    if (q > before) {
      setLastAdded(id);
      setBump((b) => b + 1);
      if (prev.length === 0) setPanelHidden(false); // premier article : le panneau s'ouvre (bureau)
    }
    setCart((cur) => {
      const i = cur.findIndex((l) => l.id === id);
      if (q === 0) return i < 0 ? cur : cur.filter((l) => l.id !== id);
      if (i < 0) return [...cur, { id, qty: q }];
      const next = cur.slice();
      next[i] = { ...cur[i], qty: q }; // le prix saisi à la main reste
      return next;
    });
  }, []);
  /** Prix unitaire changé à la main dans le panier (null = revenir au prix du revendeur). */
  const setCartPrice = useCallback((id: string, price: number | null) => {
    setCart((cur) =>
      cur.map((l) => {
        if (l.id !== id) return l;
        const { price: _old, ...rest } = l;
        return price == null ? rest : { ...rest, price };
      }),
    );
  }, []);
  const qtyById = useMemo(() => new Map(cart.map((l) => [l.id, l.qty])), [cart]);
  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const cartLines = useMemo(() => resolveCart(cart, itemById, prices), [cart, itemById, prices]);
  const cartCount = cartLines.reduce((n, l) => n + l.qty, 0);
  // Panier qui vient de se vider : la grande fenêtre se ferme (pas au chargement, quand il est encore vide).
  const prevLines = useRef(0);
  useEffect(() => {
    if (prevLines.current > 0 && cartLines.length === 0) setSheetOpen(false);
    prevLines.current = cartLines.length;
  }, [cartLines.length]);

  // Panneau à droite sur grand écran ; bouton en bas à droite + grande fenêtre sinon.
  const [deskCart, setDeskCart] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1100px)");
    const sync = () => setDeskCart(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  const panelVisible = isAdmin && deskCart && cartLines.length > 0 && !panelHidden;
  const fabVisible = isAdmin && cartLines.length > 0 && !panelVisible;

  // Facture : brouillon à l'écran (Modifier / Confirmer) ; une fois confirmée, enregistrée dans l'historique,
  // numérotée, et seule une facture confirmée s'imprime. La copie d'impression est toujours montée.
  // Le brouillon affiché est calculé par le serveur (même calcul que la confirmation) : ce qu'on voit est
  // exactement ce qui sera enregistré. À la confirmation, il est renvoyé comme « attendu » et revérifié.
  const [invoiceView, setInvoiceView] = useState<{ doc: InvoiceDoc; printAfter: boolean; draft?: Draft } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [invoiceError, setInvoiceError] = useState("");
  const [previewing, setPreviewing] = useState(false);
  const [cartError, setCartError] = useState("");
  const [printing, setPrinting] = useState<InvoiceDoc | null>(null);
  const draftDoc = (d: Draft): InvoiceDoc => ({
    rows: d.rows,
    commercial: d.commercial.name,
    city: d.commercial.city,
    number: null,
    date: new Date(),
    editing: editing?.number,
    kind,
  });
  const openInvoice = async (printAfter: boolean) => {
    if (previewing) return;
    if (!currentOption) return setCartError("Choisissez d'abord un revendeur.");
    setCartError("");
    setInvoiceError("");
    setPreviewing(true);
    try {
      const res = await fetch("/api/admin/invoices/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          commercialId: currentOption.id,
          lines: cart,
          editId: editing?.id,
          clientName: baseSelected && clientName ? clientName : undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; draft?: Draft };
      if (!res.ok || !data.draft) throw new Error(data.error ?? `Erreur ${res.status}`);
      setInvoiceView({ printAfter, draft: data.draft, doc: draftDoc(data.draft) });
    } catch (e) {
      setCartError(e instanceof Error ? e.message : `Impossible de calculer ${KIND_THE[kind]}`);
    }
    setPreviewing(false);
  };
  useEffect(() => setCartError(""), [cart, option]); // message périmé dès que le panier ou le commercial change
  const print = (doc: InvoiceDoc) => printDoc(setPrinting, doc, flushSync);
  const confirmInvoice = async () => {
    const draft = invoiceView?.draft;
    if (!invoiceView || !draft || confirming) return;
    setConfirming(true);
    setInvoiceError("");
    try {
      // Nouvelle facture, ou modification d'une facture existante (même n°).
      const res = await fetch(editing ? `/api/admin/invoices/${editing.id}` : "/api/admin/invoices", {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          commercialId: draft.commercial.id,
          clientName: baseSelected && clientName ? clientName : undefined,
          lines: draft.rows.map((r) => ({ id: r.variantId, qty: r.qty, ...(r.manual ? { price: r.unit } : {}) })),
          expected: { total: draft.total, rows: draft.rows.map((r) => ({ id: r.variantId, qty: r.qty, unit: r.unit })) },
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; invoice?: SavedInvoice; draft?: Draft };
      if (res.status === 409 && data.draft) {
        // Prix changés entre l'aperçu et la confirmation : nouveau brouillon à vérifier, rien d'enregistré.
        setInvoiceView({ ...invoiceView, draft: data.draft, doc: draftDoc(data.draft) });
        throw new Error(data.error ?? "Les prix ont changé : vérifiez puis confirmez.");
      }
      if (!res.ok || !data.invoice) throw new Error(data.error ?? `Erreur ${res.status}`);
      const doc = docOf(data.invoice);
      const printAfter = invoiceView.printAfter;
      setInvoiceView({ doc, printAfter: false });
      clearCart(); // facture enregistrée : le panier repart à zéro
      if (printAfter) print(doc);
    } catch (e) {
      setInvoiceError(e instanceof Error ? e.message : "Échec de la confirmation");
    }
    setConfirming(false);
  };
  /** Remettre une facture confirmée dans le panier pour la modifier. */
  const startEdit = (doc: InvoiceDoc) => {
    if (doc.id == null || !doc.number) return;
    const same = editing?.id === doc.id;
    if (cart.length && !same && !window.confirm(`Modifier ${KIND_THE[doc.kind]} ${doc.number} ? Le panier en cours sera remplacé.`))
      return;
    setCart(doc.rows.map((r) => ({ id: r.variantId, qty: r.qty, ...(r.manual ? { price: r.unit } : {}) })));
    setEditing({ id: doc.id, number: doc.number });
    changeClientName(doc.commercialId === BASE_ID && doc.commercial !== BASE_NAME ? doc.commercial : "");
    const o = options.find((x) => x.id === doc.commercialId);
    if (o) pickCommercial(o);
    setInvoiceView(null);
    setPanelHidden(false);
    if (!deskCart) setSheetOpen(true);
  };

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
  const leaves = useMemo(() => menuLeaves(filterNode ? [filterNode] : menu), [menu, filterNode]);
  // Un produit n'apparaît qu'une fois, dans son groupe le plus précis ; groupes dans l'ordre du menu.
  const sorted = useMemo(() => groupItems(results, items, leaves, order), [results, items, leaves, order]);
  const groupSizes = useMemo(() => {
    const m = new Map<number, number>();
    for (const { k } of sorted) m.set(k, (m.get(k) ?? 0) + 1);
    return m;
  }, [sorted]);
  /** Marque d'un groupe quand tous ses produits sont de la même marque (couleur + logo du titre). */
  const groupBrands = useMemo(() => {
    const m = new Map<number, string | null>();
    for (const { k, it } of sorted) {
      const prev = m.get(k);
      m.set(k, prev === undefined ? it.brand : prev === it.brand ? prev : null);
    }
    return m;
  }, [sorted]);
  const groupLabel = (k: number) => {
    const leaf = leaves[k];
    if (!leaf) return { crumb: "", title: "Autres" };
    // Le fil d'Ariane omet la catégorie déjà sélectionnée.
    const crumbs = leaf.crumbs.filter((c) => c.id !== filterNode?.id);
    return { crumb: crumbs.map((c) => c.title).join(" › "), title: leaf.node.title };
  };
  /** Titre de groupe toujours affiché : les cartes commencent à la même hauteur sur toutes les pages. */
  const showGroups = sorted.length > 0;
  const renderGroupHead = (k: number, list: boolean) => {
    const { crumb, title } = groupLabel(k);
    const groupBrand = groupBrands.get(k) ?? null;
    return (
      <div
        className={list ? "list-group" : "group-head"}
        role={list ? "row" : undefined}
        data-brand={groupBrand ? "true" : undefined}
        style={groupBrand ? ({ "--brand": brandStyle(groupBrand).color } as React.CSSProperties) : undefined}
      >
        {/* Pastille toujours présente (marque, ou neutre si plusieurs marques) : titre toujours au même endroit */}
        {groupBrand ? (
          <BrandBadge brand={groupBrand} className={list ? "brand-badge-xs" : "brand-badge-sm"} />
        ) : (
          <span className={`brand-badge brand-badge-neutral ${list ? "brand-badge-xs" : "brand-badge-sm"}`} aria-hidden="true">
            <GridIcon size={list ? 13 : 16} />
          </span>
        )}
        <span className="group-titles">
          {/* Ligne du fil d'Ariane toujours présente (vide au besoin) : titres de même hauteur partout */}
          <span className="group-crumb">{crumb || "\u00A0"}</span>
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
   * seulement sur bureau, indentés sous l'entrée ouverte (sur mobile, voir les rangées .mobile-cats).
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
    window.location.href = "/";
  };

  return (
    <>
      {source === "demo" && <div className="demo-banner">Mode démonstration — données fictives</div>}

      <header className="appbar">
        <div className="appbar-inner">
          <a href={isAdmin ? "/admin" : "/"} className="appbar-logo" aria-label="Mécafé — accueil">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/mecafe-logo-sm.png" alt="Mécafé" width={480} height={156} />
          </a>
          <span className="appbar-title">{isAdmin ? "TARIFS REVENDEURS" : "Tarifs professionnels"}</span>
          <div className="appbar-search">
            <SearchField
              value={query}
              onChange={changeQuery}
              inputRef={searchInput}
              placeholder={wide ? "Rechercher un produit..." : "Rechercher"}
            />
            {/* Changer de commercial : liste déroulante sous le bouton (la fenêtre floutée ne sert qu'à l'arrivée). */}
            {isAdmin && (
              <OptionPicker
                options={options}
                value={option ?? ""}
                label="Revendeur"
                onChange={(id) => {
                  const o = options.find((x) => x.id === id);
                  if (o) pickCommercial(o);
                }}
              />
            )}
          </div>
          <div className="appbar-actions">
            {isAdmin ? (
              <>
                <GlobalEye on={globalOn} onToggle={toggleGlobal} />
                <button type="button" className="logout-btn" onClick={logout} title="Se déconnecter">
                  <LogoutIcon size={18} />
                  <span className="logout-label">Se déconnecter</span>
                </button>
              </>
            ) : (
              <a href="/login?admin=1" className="admin-btn" title="Espace admin (code demandé)">
                <LockIcon size={17} />
                <span>Admin</span>
              </a>
            )}
          </div>
        </div>
      </header>

      {admin?.storageDown && (
        <div className="storage-down-banner" role="alert">
          Base de données non connectée : les devis ne peuvent pas être enregistrés. Vérifiez DATABASE_URL dans
          Vercel.
        </div>
      )}

      <main className={`container layout ${panelVisible ? "with-cart" : ""} ${fabVisible ? "has-fab" : ""}`}>
        <aside className="filters" aria-label="Filtres">
          {isAdmin && (
            <div className="admin-links">
              <Link href="/admin/gestion" className="admin-link">
                <SettingsIcon size={16} /> Gestion
              </Link>
              <Link href="/admin/gestion" className="admin-link admin-link-ghost">
                <UsersIcon size={16} /> <span className="admin-link-long">Revendeurs et villes</span>
                <span className="admin-link-short">Revendeurs</span>
              </Link>
              <Link href="/admin/gestion/factures" className="admin-link admin-link-ghost">
                <FileTextIcon size={16} /> <span className="admin-link-long">Devis/Commande</span>
                <span className="admin-link-short">Devis/Cmd</span>
              </Link>
              <Link href="/admin/gestion/pdf" className="admin-link admin-link-ghost">
                <DownloadIcon size={16} /> PDF
              </Link>
            </div>
          )}
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

          {/* Mobile / tablette : rangée des catégories toujours visible, puis une rangée par niveau
              ouvert (Café → Grains / Moulu / Dosettes → Mécafé 1kg / 250g / Kimbo…). */}
          <div className="mobile-cats">
            <nav aria-label="Catégories" className="rail">
              <button type="button" className="cat-chip" aria-pressed={path.length === 0} onClick={() => pickNode(0, null)}>
                Toutes catégories
                <span className="chip-count">{allCatCount}</span>
              </button>
              {menu.map((node) => {
                const n = countIn(node);
                const on = path[0] === node.id;
                return (
                  <button
                    key={node.id}
                    type="button"
                    className="cat-chip"
                    aria-pressed={on}
                    data-empty={n === 0}
                    onClick={() => pickNode(0, on && path.length === 1 ? null : node.id)}
                  >
                    {node.title}
                    <span className="chip-count">{n}</span>
                  </button>
                );
              })}
            </nav>
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
                    const on = path[depth + 1] === child.id;
                    return (
                      <button
                        key={child.id}
                        type="button"
                        className="cat-chip sub-chip"
                        aria-pressed={on}
                        data-empty={n === 0}
                        onClick={() => pickNode(depth + 1, on && path.length === depth + 2 ? null : child.id)}
                      >
                        {child.title}
                        <span className="chip-count">{n}</span>
                      </button>
                    );
                  })}
                </nav>
              ) : null,
            )}
          </div>
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
          <div
            className={`list ${showStock ? "with-stock" : ""} ${isAdmin ? "with-cart-col" : "site-only"}`}
            role="table"
            aria-label="Liste des produits"
          >
            <div className="list-head" role="row">
              <span role="columnheader" />
              <span role="columnheader">Produit</span>
              <span role="columnheader">Format</span>
              {showStock && <span role="columnheader">Stock</span>}
              <span role="columnheader" className="num">
                Prix site
              </span>
              {isAdmin && (
                <span role="columnheader" className="num">
                  Prix revendeur · {proLabel}
                </span>
              )}
              {isAdmin && (
                <span role="columnheader" className="num">
                  Panier
                </span>
              )}
            </div>
            {visible.map(({ it: item, k }, i) => (
              <Fragment key={item.id}>
                {showGroups && k !== visible[i - 1]?.k && renderGroupHead(k, true)}
                <ProductRow
                  item={item}
                  commercial={prices[item.id]}
                  cartQty={qtyById.get(item.id) ?? 0}
                  onCartQty={isAdmin ? setCartQty : undefined}
                  revealable={isAdmin}
                  revealed={priceDrafts[item.id] !== undefined || (overrides[item.id] ?? globalOn)}
                  onToggle={toggleOne}
                  priceEdit={priceEditOf(item.id)}
                  proLabel={proLabel}
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
                  proLabel={proLabel}
                  cartQty={qtyById.get(item.id) ?? 0}
                  onCartQty={isAdmin ? setCartQty : undefined}
                  revealable={isAdmin}
                  revealed={priceDrafts[item.id] !== undefined || (overrides[item.id] ?? globalOn)}
                  onToggle={toggleOne}
                  priceEdit={priceEditOf(item.id)}
                />
              </Fragment>
            ))}
          </div>
        )}
        {hasMore && <div ref={sentinel} className="sentinel" aria-hidden="true" />}
        </section>

        {/* Prix modifiés au crayon : enregistrer ou annuler, tous d'un coup, pour le revendeur affiché. */}
        {isAdmin && (priceDraftCount > 0 || priceMsg) && (
          <div className="select-bar price-save-bar" role="region" aria-label="Prix modifiés" aria-live="polite">
            {priceDraftCount > 0 ? (
              <>
                <span className="select-bar-count" data-error={priceMsg?.kind === "error"}>
                  {priceMsg?.kind === "error" ? (
                    priceMsg.text
                  ) : (
                    <>
                      <strong>{priceChanges.length}</strong> prix modifié{priceChanges.length > 1 ? "s" : ""}
                      <span className="price-save-who"> · {proLabel}</span>
                      {priceInvalid > 0 && <span className="price-save-bad"> · {priceInvalid} invalide{priceInvalid > 1 ? "s" : ""}</span>}
                    </>
                  )}
                </span>
                <button
                  type="button"
                  className="select-bar-cancel"
                  disabled={priceSaving}
                  onClick={() => {
                    setPriceDrafts({});
                    setPriceMsg(null);
                  }}
                >
                  Annuler
                </button>
                <button
                  type="button"
                  className="select-bar-save"
                  onClick={savePriceDrafts}
                  disabled={priceSaving || priceInvalid > 0}
                >
                  <CheckIcon size={15} /> {priceSaving ? "Enregistrement…" : "Enregistrer"}
                </button>
              </>
            ) : (
              <span className="select-bar-count price-save-done">
                <CheckIcon size={15} /> {priceMsg?.text}
              </span>
            )}
          </div>
        )}

        {panelVisible && (
          <aside className="cart-panel" aria-label="Panier">
            <CartPanel
              lines={cartLines}
              commercial={proLabel}
              lastAdded={lastAdded}
              onQty={setCartQty}
              onPrice={setCartPrice}
              kind={kind}
              onKind={editing ? undefined : pickKind}
              clientName={baseSelected ? clientName : undefined}
              onClientName={baseSelected ? changeClientName : undefined}
              onClear={clearCart}
              editing={editing?.number ?? null}
              error={cartError}
              busy={previewing}
              onInvoice={() => openInvoice(false)}
              onPrint={() => openInvoice(true)}
              onClose={() => setPanelHidden(true)}
            />
          </aside>
        )}
      </main>

      <footer className="footer">
        <p className="footer-note">
          © {new Date().getFullYear()}, TARIFS MÉCAFÉ - synchronisés avec{" "}
          <a href="https://mecafe.ma" target="_blank" rel="noopener noreferrer" className="footer-link">
            mecafe.ma
          </a>
        </p>
      </footer>

      {fabVisible && !sheetOpen && (
        <CartFab count={cartCount} bump={bump} onClick={() => (deskCart ? setPanelHidden(false) : setSheetOpen(true))} />
      )}
      {isAdmin && sheetOpen && !deskCart && cartLines.length > 0 && (
        <CartSheet onClose={() => setSheetOpen(false)}>
          <CartPanel
            sheet
            lines={cartLines}
            commercial={proLabel}
            lastAdded={lastAdded}
            onQty={setCartQty}
            onPrice={setCartPrice}
            kind={kind}
            onKind={editing ? undefined : pickKind}
            clientName={baseSelected ? clientName : undefined}
            onClientName={baseSelected ? changeClientName : undefined}
            onClear={clearCart}
            editing={editing?.number ?? null}
            error={cartError}
            busy={previewing}
            onInvoice={() => openInvoice(false)}
            onPrint={() => openInvoice(true)}
            onClose={() => setSheetOpen(false)}
          />
        </CartSheet>
      )}
      {invoiceView && (
        <InvoiceModal
          doc={invoiceView.doc}
          busy={confirming}
          error={invoiceError}
          confirmLabel={
            editing
              ? invoiceView.printAfter
                ? "Enregistrer et imprimer"
                : "Enregistrer la modification"
              : invoiceView.printAfter
                ? "Confirmer et imprimer"
                : "Confirmer"
          }
          onConfirm={confirmInvoice}
          onEdit={() => startEdit(invoiceView.doc)}
          changes={invoiceView.draft?.changes}
          onModify={() => setInvoiceView(null)}
          onClose={() => setInvoiceView(null)}
          onPrint={() => print(invoiceView.doc)}
        />
      )}
      {isAdmin && <PrintInvoice doc={printing} />}
    </>
  );
}
