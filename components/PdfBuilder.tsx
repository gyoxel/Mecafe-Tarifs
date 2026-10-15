"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fold, formatDH } from "@/lib/format";
import { defaultOption, OPTION_STORAGE_KEY, type PriceOption } from "@/lib/options";
import { BrandBadge } from "./BrandLogo";
import {
  CheckIcon,
  ChevronIcon,
  DownloadIcon,
  EyeIcon,
  FileTextIcon,
  SearchIcon,
  ShareIcon,
  TagIcon,
  UsersIcon,
} from "./Icons";
import { OptionPicker } from "./OptionPicker";
import { PdfViewer } from "./PdfViewer";

export type PdfItem = { id: string; name: string; variant: string | null; sku: string | null; price: number };
export type PdfGroup = { key: string; title: string; crumb: string; items: PdfItem[] };
export type PdfBrand = { name: string; groups: PdfGroup[] };

type Mode = "public" | "revendeur" | "validation";
const HIDE_PUBLIC_KEY = "mecafe:pdf-sans-prix-public";
type Job = "view" | "share" | "download";

const MODES: { id: Mode; title: string; text: string; Icon: typeof TagIcon }[] = [
  { id: "public", title: "Catalogue de prix", text: "Prix public seulement.", Icon: TagIcon },
  {
    id: "revendeur",
    title: "Catalogue des tarifs",
    text: "Prix public et prix du revendeur choisi.",
    Icon: UsersIcon,
  },
  {
    id: "validation",
    title: "Tarifs revendeurs - À valider",
    text: "Prix public, case « Prix revendeur » vide à remplir, mode d'emploi et visa de la direction.",
    Icon: FileTextIcon,
  },
];

const MODE_KEY = "mecafe:pdf-type";

/** Case à cocher à trois états (tout / une partie / rien). */
function TriCheck({ state, onChange, label }: { state: "all" | "some" | "none"; onChange: () => void; label: string }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = state === "some";
  }, [state]);
  return (
    <input
      ref={ref}
      type="checkbox"
      className="pdfb-check"
      checked={state === "all"}
      onChange={onChange}
      aria-label={label}
      aria-checked={state === "some" ? "mixed" : state === "all"}
    />
  );
}

const stateOf = (ids: string[], selected: Set<string>): "all" | "some" | "none" => {
  const n = ids.filter((id) => selected.has(id)).length;
  return n === 0 ? "none" : n === ids.length ? "all" : "some";
};
const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? "s" : ""}`;

/**
 * Page Gestion › PDF : type de catalogue, revendeur (tarifs revendeurs), contenu (tout, ou marques / catégories /
 * produits cochés), puis aperçu, partage ou téléchargement. Le PDF est fabriqué par le serveur (/api/admin/catalogue).
 */
export function PdfBuilder({ brands, options }: { brands: PdfBrand[]; options: PriceOption[] }) {
  const allIds = useMemo(() => brands.flatMap((b) => b.groups.flatMap((g) => g.items.map((it) => it.id))), [brands]);
  const [mode, setMode] = useState<Mode>("public");
  const [option, setOption] = useState(() => defaultOption(options)?.id ?? "");
  const [custom, setCustom] = useState(false);
  // Catalogue des tarifs : sans la colonne « Prix public » (mémorisé sur l'appareil).
  const [hidePublic, setHidePublicState] = useState(false);
  useEffect(() => {
    try {
      setHidePublicState(localStorage.getItem(HIDE_PUBLIC_KEY) === "1");
    } catch {}
  }, []);
  const setHidePublic = (v: boolean) => {
    setHidePublicState(v);
    try {
      localStorage.setItem(HIDE_PUBLIC_KEY, v ? "1" : "0");
    } catch {}
  };
  const [selected, setSelected] = useState<Set<string>>(() => new Set(allIds));
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [query, setQuery] = useState("");
  const [job, setJob] = useState<Job | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [viewing, setViewing] = useState(false);
  const [viewFile, setViewFile] = useState<File | null>(null);
  const [shareLater, setShareLater] = useState<File | null>(null);
  const cache = useRef<{ key: string; file: File } | null>(null);
  const busy = job !== null;

  // Dernier type et revendeur choisis sur cet appareil.
  useEffect(() => {
    try {
      const m = localStorage.getItem(MODE_KEY);
      if (m === "public" || m === "revendeur" || m === "validation") setMode(m);
      const o = localStorage.getItem(OPTION_STORAGE_KEY);
      if (o && options.some((x) => x.id === o)) setOption(o);
    } catch {}
  }, [options]);
  const pickMode = (m: Mode) => {
    setMode(m);
    setError("");
    try {
      localStorage.setItem(MODE_KEY, m);
    } catch {}
  };

  // Recherche : produits dont le nom, le format, la référence, la catégorie ou la marque contiennent les mots tapés.
  const words = fold(query).split(" ").filter(Boolean);
  const matches = (b: PdfBrand, g: PdfGroup, it: PdfItem) => {
    if (!words.length) return true;
    const hay = fold(`${b.name} ${g.crumb} ${g.title} ${it.name} ${it.variant ?? ""} ${it.sku ?? ""}`);
    return words.every((w) => hay.includes(w));
  };
  const shown = brands
    .map((b) => ({
      ...b,
      groups: b.groups
        .map((g) => ({ ...g, items: g.items.filter((it) => matches(b, g, it)) }))
        .filter((g) => g.items.length),
    }))
    .filter((b) => b.groups.length);
  const searching = words.length > 0;

  const ids = custom ? allIds.filter((id) => selected.has(id)) : allIds;
  const brandCount = brands.filter((b) =>
    b.groups.some((g) => g.items.some((it) => !custom || selected.has(it.id))),
  ).length;

  const toggle = (list: string[]) =>
    setSelected((cur) => {
      const next = new Set(cur);
      const all = list.every((id) => cur.has(id));
      for (const id of list) {
        if (all) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  const toggleOpen = (key: string) =>
    setOpen((cur) => {
      const next = new Set(cur);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const visibleIds = shown.flatMap((b) => b.groups.flatMap((g) => g.items.map((it) => it.id)));

  const request = {
    mode,
    option: mode === "revendeur" ? option : undefined,
    hidePublic: mode === "revendeur" && hidePublic ? true : undefined,
    ids: custom ? ids : null,
  };
  const requestKey = JSON.stringify(request);
  useEffect(() => setShareLater(null), [requestKey]); // autre choix : l'ancien PDF prêt ne vaut plus
  const title = MODES.find((m) => m.id === mode)?.title ?? "Catalogue";

  // Le PDF est fabriqué une fois par choix (type, revendeur, contenu) : voir, puis partager ou télécharger,
  // ne le refait pas. La barre avance pendant que le serveur le prépare (durée inconnue), puis se complète.
  const getPdf = async (kind: Job): Promise<File> => {
    if (cache.current?.key === requestKey) return cache.current.file;
    setJob(kind);
    setProgress(0.04);
    const tick = setInterval(() => setProgress((p) => p + (0.95 - p) * 0.05), 120);
    try {
      const res = await fetch("/api/admin/catalogue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: requestKey,
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `Erreur ${res.status}`);
      }
      const name =
        /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? "Catalogue-Mecafe.pdf";
      const file = new File([await res.blob()], name, { type: "application/pdf" });
      cache.current = { key: requestKey, file };
      setProgress(1);
      return file;
    } finally {
      clearInterval(tick);
    }
  };
  const fail = (e: unknown) => setError(e instanceof Error ? e.message : "Le PDF n'a pas pu être préparé. Réessayez.");

  const save = (file: File) => {
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  };

  /** Feuille de partage du téléphone (WhatsApp, e-mail…) ; sans partage de fichiers (ordinateur), téléchargement. */
  const shareFile = async (file: File) => {
    setShareLater(null);
    if (!navigator.canShare?.({ files: [file] })) return save(file);
    try {
      await navigator.share({ files: [file], title });
    } catch (e) {
      const name = (e as Error)?.name;
      // Partage lancé trop longtemps après le toucher (préparation du PDF) : le navigateur demande un nouveau toucher.
      if (name === "NotAllowedError") setShareLater(file);
      else if (name !== "AbortError") save(file);
    }
  };

  const run = async (kind: Job) => {
    if (!ids.length || busy) return;
    setError("");
    setShareLater(null);
    if (kind === "view") {
      setViewFile(cache.current?.key === requestKey ? cache.current.file : null);
      setViewing(true);
    }
    try {
      const file = await getPdf(kind);
      if (kind === "download") save(file);
      else if (kind === "share") await shareFile(file);
      else setViewFile(file);
    } catch (e) {
      fail(e);
      if (kind === "view") setViewing(false);
    } finally {
      setJob(null);
    }
  };
  const closeViewer = useCallback(() => {
    setViewing(false);
    setViewFile(null);
  }, []);

  return (
    <section className="admin-options pdfb">
      <h2 className="admin-section-title">PDF</h2>
      <p className="muted small admin-options-hint">
        Choisissez le type de catalogue et son contenu, puis voyez-le, partagez-le ou téléchargez-le. Prix et photos à
        jour depuis le site.
      </p>

      <h3 className="pdfb-step">
        <span>1</span> Type de catalogue
      </h3>
      <div className="pdfb-modes" role="radiogroup" aria-label="Type de catalogue">
        {MODES.map(({ id, title, text, Icon }) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={mode === id}
            className="pdfb-mode"
            onClick={() => pickMode(id)}
          >
            <span className="pdfb-mode-icon">
              <Icon size={18} />
            </span>
            <span className="pdfb-mode-text">
              <strong>{title}</strong>
              <span>{text}</span>
            </span>
            <span className="pdfb-mode-check">{mode === id && <CheckIcon size={14} />}</span>
          </button>
        ))}
      </div>
      {mode === "revendeur" && (
        <div className="pdfb-reseller">
          <span className="admin-options-label">Revendeur</span>
          <OptionPicker options={options} value={option} onChange={setOption} label="Revendeur" />
          <label className="check pdfb-hide-public">
            <input type="checkbox" checked={hidePublic} onChange={(e) => setHidePublic(e.target.checked)} />
            Masquer le prix public
          </label>
          <span className="muted small">
            {hidePublic
              ? "Seul le prix du revendeur figure sur le PDF, en « Prix TTC »."
              : "Son nom figure sur le PDF ; « — » pour un produit sans prix revendeur."}
          </span>
        </div>
      )}

      <h3 className="pdfb-step">
        <span>2</span> Contenu
      </h3>
      <div className="pdfb-scope" role="radiogroup" aria-label="Contenu">
        <button type="button" role="radio" aria-checked={!custom} onClick={() => setCustom(false)}>
          Tout le catalogue <span className="pdfb-scope-count">{allIds.length}</span>
        </button>
        <button type="button" role="radio" aria-checked={custom} onClick={() => setCustom(true)}>
          Choisir marques, catégories, produits
        </button>
      </div>

      {custom && (
        <div className="pdfb-picker">
          <div className="pdfb-tools">
            <label className="opt-search pdfb-search">
              <SearchIcon size={16} />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Rechercher un produit, une catégorie…"
                aria-label="Rechercher dans le catalogue"
              />
            </label>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setSelected((cur) => new Set([...cur, ...visibleIds]))}
            >
              Tout cocher
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() =>
                setSelected((cur) => {
                  const next = new Set(cur);
                  visibleIds.forEach((id) => next.delete(id));
                  return next;
                })
              }
            >
              Tout décocher
            </button>
          </div>

          <ul className="pdfb-tree">
            {shown.map((b) => {
              const bIds = b.groups.flatMap((g) => g.items.map((it) => it.id));
              const bOpen = searching || open.has(b.name);
              const bSel = bIds.filter((id) => selected.has(id)).length;
              return (
                <li key={b.name} className="pdfb-brand">
                  <div className="pdfb-row pdfb-row-brand">
                    <TriCheck
                      state={stateOf(bIds, selected)}
                      onChange={() => toggle(bIds)}
                      label={`Marque ${b.name}`}
                    />
                    <button
                      type="button"
                      className="pdfb-open"
                      onClick={() => toggleOpen(b.name)}
                      aria-expanded={bOpen}
                    >
                      <BrandBadge brand={b.name} className="brand-badge-xs" />
                      <span className="pdfb-name">{b.name}</span>
                      <span className="pdfb-count">
                        {bSel} / {bIds.length}
                      </span>
                      <ChevronIcon size={16} className="pdfb-chevron" />
                    </button>
                  </div>
                  {bOpen && (
                    <ul>
                      {b.groups.map((g) => {
                        const gIds = g.items.map((it) => it.id);
                        const gOpen = searching || open.has(g.key);
                        return (
                          <li key={g.key} className="pdfb-group">
                            <div className="pdfb-row pdfb-row-group">
                              <TriCheck
                                state={stateOf(gIds, selected)}
                                onChange={() => toggle(gIds)}
                                label={`Catégorie ${g.title}`}
                              />
                              <button
                                type="button"
                                className="pdfb-open"
                                onClick={() => toggleOpen(g.key)}
                                aria-expanded={gOpen}
                              >
                                <span className="pdfb-name">
                                  {g.crumb && <span className="pdfb-crumb">{g.crumb} › </span>}
                                  {g.title}
                                </span>
                                <span className="pdfb-count">
                                  {gIds.filter((id) => selected.has(id)).length} / {gIds.length}
                                </span>
                                <ChevronIcon size={15} className="pdfb-chevron" />
                              </button>
                            </div>
                            {gOpen && (
                              <ul>
                                {g.items.map((it) => (
                                  <li key={it.id}>
                                    <label className="pdfb-row pdfb-row-item">
                                      <input
                                        type="checkbox"
                                        className="pdfb-check"
                                        checked={selected.has(it.id)}
                                        onChange={() => toggle([it.id])}
                                      />
                                      <span className="pdfb-name">{it.name}</span>
                                      {it.variant && <span className="pdfb-variant">{it.variant}</span>}
                                      <span className="pdfb-price">{formatDH(it.price)}</span>
                                    </label>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              );
            })}
            {shown.length === 0 && <li className="pdfb-empty">Aucun produit « {query.trim()} »</li>}
          </ul>
        </div>
      )}

      <div className="pdfb-bar">
        <span className="pdfb-summary">
          <strong>{plural(ids.length, "produit")}</strong>
          {ids.length > 0 && <span className="muted"> · {plural(brandCount, "marque")}</span>}
        </span>
        <div className="pdfb-actions">
          <button
            type="button"
            className="btn btn-ghost pdfb-icon"
            onClick={() => run("view")}
            disabled={busy || !ids.length}
            aria-label="Voir le PDF"
            title="Voir le PDF"
          >
            {job === "view" ? <span className="spinner" aria-hidden="true" /> : <EyeIcon size={19} />}
          </button>
          <button
            type="button"
            className="btn btn-ghost pdfb-icon"
            onClick={() => (shareLater ? shareFile(shareLater) : run("share"))}
            disabled={(busy || !ids.length) && !shareLater}
            aria-label="Partager le PDF"
            title="Partager le PDF"
          >
            {job === "share" ? <span className="spinner" aria-hidden="true" /> : <ShareIcon size={18} />}
          </button>
          <button
            type="button"
            className="btn btn-gold pdfb-download"
            onClick={() => run("download")}
            disabled={busy || !ids.length}
          >
            {job === "download" ? <span className="spinner" aria-hidden="true" /> : <DownloadIcon size={17} />}
            Télécharger le PDF
          </button>
        </div>
        {busy && job !== "view" && (
          <div
            className="pdfb-progress"
            role="progressbar"
            aria-label="Préparation du PDF"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
          >
            <span style={{ transform: `scaleX(${progress})` }} />
            <em>Préparation du PDF… {Math.round(progress * 100)} %</em>
          </div>
        )}
        {shareLater && (
          <button type="button" className="btn btn-gold pdfb-share-ready" onClick={() => shareFile(shareLater)}>
            <ShareIcon size={17} /> PDF prêt : toucher pour partager
          </button>
        )}
        {error && (
          <p className="pdfb-error" role="alert">
            {error}
          </p>
        )}
      </div>
      {viewing && (
        <PdfViewer
          title={title}
          file={viewFile}
          progress={progress}
          onClose={closeViewer}
          onShare={() => viewFile && shareFile(viewFile)}
          onDownload={() => viewFile && save(viewFile)}
        />
      )}
    </section>
  );
}
