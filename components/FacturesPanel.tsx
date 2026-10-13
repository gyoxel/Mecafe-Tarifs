"use client";

import { useMemo, useState } from "react";
import { flushSync } from "react-dom";
import { fold, formatDH } from "@/lib/format";
import { sumMoney } from "@/lib/money";
import type { SavedInvoice } from "@/lib/invoice-types";
import type { PriceOption } from "@/lib/options";
import { CommercialFilter } from "./CommercialFilter";
import { invoicesDetailCsv, invoicesSummaryCsv, downloadText } from "@/lib/invoice-csv";
import { CalendarIcon, DownloadIcon, FileTextIcon, PencilIcon, SearchIcon, TrashIcon } from "./Icons";
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
const keyOf = (inv: SavedInvoice) => inv.commercialId ?? `nom:${inv.commercial}`;

export function FacturesPanel({ invoices: initial, options }: { invoices: SavedInvoice[]; options: PriceOption[] }) {
  const [invoices, setInvoices] = useState(initial);
  const [deleting, setDeleting] = useState<number | null>(null);
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
        list.push({ id: k, name: inv.commercial, city: inv.city, offset: 0, isDefault: false });
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

  /** Retour au catalogue admin, le devis remis dans le panier pour le modifier. */
  const edit = (inv: SavedInvoice) => {
    window.location.href = `/admin?modifier=${inv.id}`;
  };
  const remove = async (inv: SavedInvoice) => {
    if (!window.confirm(`Supprimer le devis ${inv.number} (${inv.commercial}, ${formatDH(inv.total)}) ?\nIl disparaît de l'historique ; son n° ne sera pas redonné.`)) return;
    setDeleting(inv.id);
    setError("");
    try {
      const res = await fetch(`/api/admin/invoices/${inv.id}`, { method: "DELETE" });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? `Erreur ${res.status}`);
      setInvoices((list) => list.filter((i) => i.id !== inv.id));
      if (open?.id === inv.id) setOpen(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Suppression impossible");
    } finally {
      setDeleting(null);
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
            // Un clic sur la ligne ouvre le devis ; Modifier / Supprimer à droite.
            <div key={inv.id} className="facture-row" role="row" onClick={() => setOpen(inv)}>
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
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => edit(inv)} disabled={deleting === inv.id}>
                  <PencilIcon size={14} /> Modifier
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm facture-delete"
                  onClick={() => remove(inv)}
                  disabled={deleting === inv.id}
                >
                  <TrashIcon size={14} /> {deleting === inv.id ? "Suppression…" : "Supprimer"}
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
          onDelete={() => remove(open)}
        />
      )}
      <PrintInvoice doc={printing} />
    </section>
  );
}
