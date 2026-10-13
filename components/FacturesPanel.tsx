"use client";

import { useEffect, useMemo, useState } from "react";
import { flushSync } from "react-dom";
import { fold, formatDH } from "@/lib/format";
import { sumMoney } from "@/lib/money";
import type { SavedInvoice } from "@/lib/invoice-types";
import { BASE_ID, BASE_NAME, type PriceOption } from "@/lib/options";
import { CommercialFilter } from "./CommercialFilter";
import { invoicesDetailCsv, invoicesSummaryCsv, downloadText } from "@/lib/invoice-csv";
import { CalendarIcon, DownloadIcon, FileTextIcon, PencilIcon, PrinterIcon, SearchIcon, TrashIcon } from "./Icons";
import { InvoiceModal, PrintInvoice, docOf, printDoc, type InvoiceDoc } from "./Invoice";

const p2 = (n: number) => String(n).padStart(2, "0");
/** Date locale « AAAA-MM-JJ » (valeur des champs date). */
const dayKey = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
const dateTime = (d: Date) => `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()} · ${p2(d.getHours())}:${p2(d.getMinutes())}`;


type Period = "all" | "today" | "7d" | "month";
const PERIODS: { id: Period; label: string }[] = [
  { id: "all", label: "Tout" },
  { id: "today", label: "Aujourd'hui" },
  { id: "7d", label: "7 jours" },
  { id: "month", label: "Ce mois" },
];

/** Gestion › Devis : historique des devis confirmés, avec recherche et filtres. */
/** Clé du commercial d'une facture : son id, ou son nom s'il a été supprimé depuis. */
// Devis « Prix Gros » au nom d'un client tapé dans le panier : rangé sous ce nom (pas sous « Prix Gros », ni
// sous son ancien nom « Revendeur »).
const baseNames = new Set([BASE_NAME, "Revendeur"]);
const keyOf = (inv: SavedInvoice) =>
  inv.commercialId == null || (inv.commercialId === BASE_ID && !baseNames.has(inv.commercial))
    ? `nom:${inv.commercial}`
    : inv.commercialId;

export function FacturesPanel({ invoices: initial, options }: { invoices: SavedInvoice[]; options: PriceOption[] }) {
  const [invoices, setInvoices] = useState(initial);
  // Sélection pour supprimer : cases à cocher, puis barre flottante « Supprimer / Annuler ».
  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [commercial, setCommercial] = useState<string | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [open, setOpen] = useState<SavedInvoice | null>(null);
  const [printing, setPrinting] = useState<InvoiceDoc | null>(null);

  // Tous les commerciaux actuels, plus ceux supprimés depuis qui ont encore des factures.
  const commercials = useMemo(() => {
    const list: PriceOption[] = [...options];
    const known = new Set(options.map((o) => o.id));
    for (const inv of invoices) {
      const k = keyOf(inv);
      if (!known.has(k)) {
        known.add(k);
        list.push({ id: k, name: inv.commercial, city: inv.city, offset: 0, isDefault: false, source: "base" });
      }
    }
    return list.sort((a, b) => fold(a.name).localeCompare(fold(b.name)));
  }, [options, invoices]);
  // Texte recherché par facture : n°, commercial, ville, produits, formats, SKU.
  const haystacks = useMemo(
    () =>
      invoices.map((i) =>
        fold([i.number, i.commercial, i.city ?? "", ...i.rows.flatMap((r) => [r.brand, r.name, r.variant ?? "", r.sku ?? ""])].join(" ")),
      ),
    [invoices],
  );

  const setPeriod = (p: Period) => {
    const now = new Date();
    if (p === "all") {
      setFrom("");
      setTo("");
    } else if (p === "today") {
      setFrom(dayKey(now));
      setTo(dayKey(now));
    } else if (p === "7d") {
      setFrom(dayKey(new Date(now.getTime() - 6 * 86400000)));
      setTo(dayKey(now));
    } else {
      setFrom(dayKey(new Date(now.getFullYear(), now.getMonth(), 1)));
      setTo(dayKey(now));
    }
  };
  const activePeriod = useMemo<Period | null>(() => {
    const now = new Date();
    if (!from && !to) return "all";
    if (to !== dayKey(now)) return null;
    if (from === dayKey(now)) return "today";
    if (from === dayKey(new Date(now.getTime() - 6 * 86400000))) return "7d";
    if (from === dayKey(new Date(now.getFullYear(), now.getMonth(), 1))) return "month";
    return null;
  }, [from, to]);

  const shown = useMemo(() => {
    const words = fold(query).split(" ").filter(Boolean);
    return invoices.filter((inv, i) => {
      const day = dayKey(new Date(inv.createdAt));
      return (
        (!commercial || keyOf(inv) === commercial) &&
        (!from || day >= from) &&
        (!to || day <= to) &&
        words.every((w) => haystacks[i].includes(w))
      );
    });
  }, [invoices, haystacks, query, commercial, from, to]);
  const sum = sumMoney(shown.map((i) => i.total));
  // Filtres changés : la sélection repart à zéro (on ne supprime jamais un devis qu'on ne voit plus).
  useEffect(() => setSelected(new Set()), [query, commercial, from, to]);

  /** Retour au catalogue admin, le devis remis dans le panier pour le modifier. */
  const edit = (inv: SavedInvoice) => {
    window.location.href = `/admin?modifier=${inv.id}`;
  };
  const toggle = (id: number) =>
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const removeSelected = async () => {
    const list = invoices.filter((i) => selected.has(i.id));
    if (!list.length) return;
    const label = list.length === 1 ? `le devis ${list[0].number}` : `ces ${list.length} devis`;
    if (!window.confirm(`Supprimer ${label} ?\nIls disparaissent de l'historique ; leurs n° ne seront pas redonnés.`)) return;
    setDeleting(true);
    setError("");
    try {
      const res = await fetch("/api/admin/invoices", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: list.map((i) => i.id) }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? `Erreur ${res.status}`);
      const gone = new Set(list.map((i) => i.id));
      setInvoices((all) => all.filter((i) => !gone.has(i.id)));
      setSelected(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Suppression impossible");
    } finally {
      setDeleting(false);
    }
  };

  const filtered = Boolean(query.trim() || commercial || from || to);

  return (
    <section className="admin-options factures">
      <h2 className="admin-section-title">Devis - Historique</h2>
      <p className="muted small admin-options-hint">
        Les devis confirmés depuis le panier. Ils sont figés : les prix ne changent plus.
      </p>

      <div className="factures-tools">
        <label className="opt-search factures-search">
          <SearchIcon size={16} />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher : n°, revendeur, ville, produit…"
            aria-label="Rechercher un devis"
          />
        </label>
        <div className="factures-commercial">
          <CommercialFilter options={commercials} value={commercial} onChange={setCommercial} />
        </div>
        <div className="factures-dates">
          <label className="date-field">
            <CalendarIcon size={15} />
            <span>Du</span>
            <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="date-field">
            <CalendarIcon size={15} />
            <span>Au</span>
            <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
          </label>
        </div>
        <div className="factures-periods" role="group" aria-label="Période">
          {PERIODS.map((p) => (
            <button key={p.id} type="button" className="period-chip" aria-pressed={activePeriod === p.id} onClick={() => setPeriod(p.id)}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="factures-summary">
        <span>
          <strong>{shown.length}</strong> devis
          {filtered && invoices.length !== shown.length && <span className="muted"> sur {invoices.length}</span>}
        </span>
        <span>
          Total <strong>{formatDH(sum)}</strong>
        </span>
      </div>

      {/* Export Excel des factures affichées (filtres appliqués). */}
      <div className="factures-export">
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={!shown.length}
          onClick={() => downloadText(`devis-${dayKey(new Date())}.csv`, invoicesSummaryCsv(shown))}
        >
          <DownloadIcon size={15} /> Exporter les devis
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={!shown.length}
          onClick={() => downloadText(`devis-detail-${dayKey(new Date())}.csv`, invoicesDetailCsv(shown))}
        >
          <DownloadIcon size={15} /> Exporter le détail (produits)
        </button>
        <span className="muted small">Fichiers Excel (CSV), selon les filtres.</span>
      </div>

      {shown.length === 0 ? (
        <div className="factures-empty">
          <FileTextIcon size={26} />
          <p>{invoices.length ? "Aucun devis ne correspond aux filtres." : "Aucun devis confirmé pour le moment."}</p>
        </div>
      ) : (
        <div className="factures-list" role="table" aria-label="Devis">
          <div className="facture-row facture-head" role="row">
            <span role="columnheader" className="facture-check">
              <input
                type="checkbox"
                aria-label="Tout sélectionner"
                checked={shown.length > 0 && shown.every((i) => selected.has(i.id))}
                ref={(el) => {
                  if (el) el.indeterminate = shown.some((i) => selected.has(i.id)) && !shown.every((i) => selected.has(i.id));
                }}
                onChange={(e) =>
                  setSelected((cur) => {
                    const next = new Set(cur);
                    for (const i of shown) {
                      if (e.target.checked) next.add(i.id);
                      else next.delete(i.id);
                    }
                    return next;
                  })
                }
              />
            </span>
            <span role="columnheader">N°</span>
            <span role="columnheader">Date</span>
            <span role="columnheader">Revendeur</span>
            <span role="columnheader" className="num">
              Articles
            </span>
            <span role="columnheader" className="num">
              Total
            </span>
            <span role="columnheader" className="facture-actions-head">
              Actions
            </span>
          </div>
          {shown.map((inv) => (
            // Un clic sur la ligne ouvre le devis ; case à cocher pour supprimer, Modifier à droite.
            <div
              key={inv.id}
              className="facture-row"
              role="row"
              data-selected={selected.has(inv.id)}
              onClick={() => setOpen(inv)}
            >
              <span role="cell" className="facture-check" onClick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  aria-label={`Sélectionner ${inv.number}`}
                  checked={selected.has(inv.id)}
                  onChange={() => toggle(inv.id)}
                />
              </span>
              <span role="cell" className="facture-number">
                <button type="button" className="facture-open" onClick={() => setOpen(inv)} title="Voir le devis">
                  {inv.number}
                </button>
                {inv.updatedAt && (
                  <span className="facture-updated" title={`Modifié le ${dateTime(new Date(inv.updatedAt))}`}>
                    modifié
                  </span>
                )}
              </span>
              <span role="cell" className="facture-date">
                {dateTime(new Date(inv.createdAt))}
              </span>
              <span role="cell" className="facture-commercial">
                <strong>{inv.commercial}</strong>
                {inv.city && <span className="muted"> · {inv.city}</span>}
              </span>
              <span role="cell" className="num facture-count">
                {inv.count} art.
              </span>
              <span role="cell" className="num facture-total">
                {formatDH(inv.total)}
              </span>
              <span role="cell" className="facture-actions" onClick={(e) => e.stopPropagation()}>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => edit(inv)}>
                  <PencilIcon size={14} /> Modifier
                </button>
                <button
                  type="button"
                  className="icon-btn facture-print"
                  onClick={() => printDoc(setPrinting, docOf(inv), flushSync)}
                  aria-label={`Imprimer ${inv.number}`}
                  title="Imprimer"
                >
                  <PrinterIcon size={16} />
                </button>
              </span>
            </div>
          ))}
        </div>
      )}
      {error && (
        <p className="notice warn" role="alert">
          {error}
        </p>
      )}

      {open && (
        <InvoiceModal
          doc={docOf(open)}
          onClose={() => setOpen(null)}
          onPrint={() => printDoc(setPrinting, docOf(open), flushSync)}
          onEdit={() => edit(open)}
        />
      )}
      <PrintInvoice doc={printing} />

      {/* Barre flottante en bas : supprimer les devis cochés, ou annuler la sélection. */}
      {selected.size > 0 && <div className="select-bar-space" aria-hidden="true" />}
      {selected.size > 0 && (
        <div className="select-bar" role="region" aria-label="Devis sélectionnés">
          <span className="select-bar-count">
            <strong>{selected.size}</strong> sélectionné{selected.size > 1 ? "s" : ""}
          </span>
          <button type="button" className="select-bar-cancel" onClick={() => setSelected(new Set())} disabled={deleting}>
            Annuler
          </button>
          <button type="button" className="select-bar-delete" onClick={removeSelected} disabled={deleting}>
            <TrashIcon size={15} /> {deleting ? "Suppression…" : "Supprimer"}
          </button>
        </div>
      )}
    </section>
  );
}
