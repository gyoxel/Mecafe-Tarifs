"use client";

import { useMemo, useState } from "react";
import { flushSync } from "react-dom";
import { fold, formatDH } from "@/lib/format";
import type { SavedInvoice } from "@/lib/invoice-types";
import { FilterSelect } from "./FilterSelect";
import { CalendarIcon, CheckIcon, FileTextIcon, SearchIcon, UsersIcon } from "./Icons";
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

/** Gestion › Factures : historique des factures confirmées, avec recherche et filtres. */
export function FacturesPanel({ invoices }: { invoices: SavedInvoice[] }) {
  const [query, setQuery] = useState("");
  const [commercial, setCommercial] = useState<string | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [open, setOpen] = useState<SavedInvoice | null>(null);
  const [printing, setPrinting] = useState<InvoiceDoc | null>(null);

  const commercials = useMemo(
    () => [...new Set(invoices.map((i) => i.commercial))].sort((a, b) => fold(a).localeCompare(fold(b))),
    [invoices],
  );
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
        (!commercial || inv.commercial === commercial) &&
        (!from || day >= from) &&
        (!to || day <= to) &&
        words.every((w) => haystacks[i].includes(w))
      );
    });
  }, [invoices, haystacks, query, commercial, from, to]);
  const sum = shown.reduce((s, i) => s + i.total, 0);
  const filtered = Boolean(query.trim() || commercial || from || to);

  return (
    <section className="admin-options factures">
      <h2 className="admin-section-title">Factures</h2>
      <p className="muted small admin-options-hint">
        Les factures confirmées depuis le panier. Elles sont figées : les prix ne changent plus.
      </p>

      <div className="factures-tools">
        <label className="opt-search factures-search">
          <SearchIcon size={16} />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher : n°, commercial, ville, produit…"
            aria-label="Rechercher une facture"
          />
        </label>
        <div className="factures-commercial">
          <FilterSelect
            values={commercials}
            value={commercial}
            onChange={setCommercial}
            allLabel="Tous les commerciaux"
            label="Filtrer par commercial"
            icon={<UsersIcon size={15} />}
          />
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
          <strong>{shown.length}</strong> facture{shown.length > 1 ? "s" : ""}
          {filtered && invoices.length !== shown.length && <span className="muted"> sur {invoices.length}</span>}
        </span>
        <span>
          Total <strong>{formatDH(sum)}</strong>
        </span>
      </div>

      {shown.length === 0 ? (
        <div className="factures-empty">
          <FileTextIcon size={26} />
          <p>{invoices.length ? "Aucune facture ne correspond aux filtres." : "Aucune facture confirmée pour le moment."}</p>
        </div>
      ) : (
        <div className="factures-list" role="table" aria-label="Factures">
          <div className="facture-row facture-head" role="row">
            <span role="columnheader">N°</span>
            <span role="columnheader">Date</span>
            <span role="columnheader">Commercial</span>
            <span role="columnheader" className="num">
              Articles
            </span>
            <span role="columnheader" className="num">
              Total
            </span>
            <span role="columnheader">Statut</span>
          </div>
          {shown.map((inv) => (
            <button key={inv.id} type="button" className="facture-row" role="row" onClick={() => setOpen(inv)}>
              <span role="cell" className="facture-number">
                {inv.number}
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
              <span role="cell">
                <span className="facture-status">
                  <CheckIcon size={13} /> Confirmée
                </span>
                {inv.updatedAt && (
                  <span className="facture-updated" title={`Modifiée le ${dateTime(new Date(inv.updatedAt))}`}>
                    modifiée
                  </span>
                )}
              </span>
            </button>
          ))}
        </div>
      )}

      {open && (
        <InvoiceModal
          doc={docOf(open)}
          onClose={() => setOpen(null)}
          onPrint={() => printDoc(setPrinting, docOf(open), flushSync)}
          onEdit={() => {
            // Retour au catalogue admin, la facture remise dans le panier.
            window.location.href = `/admin?modifier=${open.id}`;
          }}
        />
      )}
      <PrintInvoice doc={printing} />
    </section>
  );
}
