"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { invoiceDate } from "@/lib/cart";
import { formatDH } from "@/lib/format";
import { sumRows, type InvoiceRow } from "@/lib/invoice-types";
import { CheckIcon, PrinterIcon } from "./Icons";
import { lockScroll } from "./scroll";

/** Ce qu'affiche une facture : brouillon (pas de n°) ou confirmée. */
export type InvoiceDoc = {
  rows: InvoiceRow[];
  commercial: string;
  city: string | null;
  /** null = brouillon, pas encore confirmé (pas de n°). */
  number: string | null;
  date: Date;
};

export function Invoice({ doc }: { doc: InvoiceDoc }) {
  const { count, total } = sumRows(doc.rows);
  const anySite = doc.rows.some((r) => r.sitePrice);
  return (
    <article className="invoice" data-draft={doc.number == null}>
      <header className="invoice-head">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="invoice-logo" src="/mecafe-logo.png" alt="Mécafé 1988" width={1126} height={366} />
        <div className="invoice-id">
          <h2>Facture</h2>
          {doc.number ? (
            <p>
              N° <strong>{doc.number}</strong>
            </p>
          ) : (
            <p className="invoice-draft">Brouillon · non confirmée</p>
          )}
          <p>Date : {invoiceDate(doc.date)}</p>
        </div>
      </header>

      <div className="invoice-party">
        <span className="invoice-label">Commercial</span>
        <strong>{doc.commercial}</strong>
        {doc.city && <span>{doc.city}</span>}
      </div>

      <table className="invoice-table">
        <thead>
          <tr>
            <th className="num">#</th>
            <th>Produit</th>
            <th className="invoice-format">Format</th>
            <th className="num">Qté</th>
            <th className="num">
              <span className="invoice-pu-long">Prix unitaire</span>
              <span className="invoice-pu-short">P.U.</span>
            </th>
            <th className="num">Total</th>
          </tr>
        </thead>
        <tbody>
          {doc.rows.map((r, i) => (
            <tr key={r.variantId}>
              <td className="num">{i + 1}</td>
              <td>
                <span className="invoice-brand">{r.brand}</span> {r.name}
                {r.sku && <span className="invoice-sku"> · {r.sku}</span>}
                {r.variant && <span className="invoice-format-inline">{r.variant}</span>}
              </td>
              <td className="invoice-format">{r.variant ?? "—"}</td>
              <td className="num">{r.qty}</td>
              <td className="num">
                {formatDH(r.unit)}
                {r.sitePrice && "*"}
              </td>
              <td className="num">{formatDH(r.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="invoice-sum">
        <span>
          {count} article{count > 1 ? "s" : ""}
        </span>
        <span className="invoice-sum-total">
          <span className="invoice-total-label">Total</span>
          <span className="invoice-total">{formatDH(total)}</span>
        </span>
      </div>
      {anySite && <p className="invoice-note">* Prix du site (pas de prix commercial pour ce produit).</p>}
      <footer className="invoice-foot">Mécafé · mecafe.ma</footer>
    </article>
  );
}

/**
 * Facture à l'écran. Brouillon : « Modifier » (retour au panier) ou « Confirmer » (enregistrée dans
 * l'historique, numérotée). Confirmée : « Imprimer ».
 */
export function InvoiceModal({
  doc,
  onClose,
  onPrint,
  onModify,
  onConfirm,
  confirmLabel = "Confirmer",
  busy,
  error,
}: {
  doc: InvoiceDoc;
  onClose: () => void;
  onPrint: () => void;
  /** Brouillon seulement. */
  onModify?: () => void;
  onConfirm?: () => void;
  confirmLabel?: string;
  busy?: boolean;
  error?: string;
}) {
  const draft = doc.number == null;
  useEffect(() => {
    const unlock = lockScroll();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      unlock();
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose, busy]);

  return (
    <div className="invoice-backdrop" onPointerDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="invoice-modal" role="dialog" aria-modal="true" aria-label="Facture">
        <div className="invoice-bar">
          {draft ? (
            <span className="invoice-status draft">Brouillon</span>
          ) : (
            <span className="invoice-status ok">
              <CheckIcon size={15} /> Confirmée · {doc.number}
            </span>
          )}
          <span className="invoice-bar-actions">
            {draft ? (
              <>
                <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={onModify ?? onClose}>
                  Modifier
                </button>
                <button type="button" className="btn btn-gold btn-sm" disabled={busy} onClick={onConfirm}>
                  <CheckIcon size={16} /> {busy ? "Confirmation…" : confirmLabel}
                </button>
              </>
            ) : (
              <>
                <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
                  Fermer
                </button>
                <button type="button" className="btn btn-gold btn-sm" onClick={onPrint}>
                  <PrinterIcon size={16} /> Imprimer
                </button>
              </>
            )}
          </span>
        </div>
        {error && <p className="notice warn invoice-error">{error}</p>}
        <div className="invoice-paper">
          <Invoice doc={doc} />
        </div>
      </div>
    </div>
  );
}

/**
 * Copie réservée à l'impression (seul élément imprimé, voir @media print). Montée dès l'arrivée sur la page,
 * pour qu'elle soit déjà dans le document au moment de window.print().
 */
export function PrintInvoice({ doc }: { doc: InvoiceDoc | null }) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => setHost(document.body), []);
  return host ? createPortal(<div className="print-root">{doc && <Invoice doc={doc} />}</div>, host) : null;
}

/** Imprime `doc` : la copie d'impression est mise à jour de façon synchrone, puis la boîte d'impression s'ouvre. */
export function printDoc(setDoc: (d: InvoiceDoc) => void, doc: InvoiceDoc, flush: (fn: () => void) => void) {
  flush(() => setDoc(doc));
  const title = document.title;
  if (doc.number) document.title = `Facture ${doc.number}`; // nom proposé pour « Enregistrer en PDF »
  window.print();
  document.title = title;
}
