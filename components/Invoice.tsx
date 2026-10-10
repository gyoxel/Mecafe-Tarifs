"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { invoiceDate } from "@/lib/cart";
import { formatDH } from "@/lib/format";
import { sumRows, type InvoiceRow, type SavedInvoice } from "@/lib/invoice-types";
import { CheckIcon, CloseIcon, PencilIcon, PrinterIcon, ShareIcon } from "./Icons";
import { lockScroll } from "./scroll";

/** Ce qu'affiche une facture : brouillon (pas de n°) ou confirmée. */
export type InvoiceDoc = {
  rows: InvoiceRow[];
  commercial: string;
  city: string | null;
  /** null = brouillon, pas encore confirmé (pas de n°). */
  number: string | null;
  date: Date;
  /** Facture enregistrée : id (PDF, modification), commercial d'origine, date de modification. */
  id?: number;
  commercialId?: string | null;
  updatedAt?: Date | null;
  /** Brouillon qui modifie une facture existante : son n°. */
  editing?: string;
};

/** Facture enregistrée → document affichable. */
export const docOf = (inv: SavedInvoice): InvoiceDoc => ({
  rows: inv.rows,
  commercial: inv.commercial,
  city: inv.city,
  number: inv.number,
  date: new Date(inv.createdAt),
  id: inv.id,
  commercialId: inv.commercialId,
  updatedAt: inv.updatedAt ? new Date(inv.updatedAt) : null,
});

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
          ) : doc.editing ? (
            <p className="invoice-draft">Modification de {doc.editing} · non enregistrée</p>
          ) : (
            <p className="invoice-draft">Brouillon · non confirmée</p>
          )}
          <p>Date : {invoiceDate(doc.date)}</p>
          {doc.updatedAt && <p className="invoice-updated">Modifiée le {invoiceDate(doc.updatedAt)}</p>}
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
 * Partage la facture en PDF : feuille de partage du téléphone (WhatsApp, e-mail…) si le navigateur sait
 * partager un fichier, sinon téléchargement. Le PDF est préparé dès l'ouverture : le partage part tout de
 * suite au clic (certains navigateurs refusent un partage lancé après une attente).
 */
function usePdf(id: number | undefined, number: string | null) {
  const [file, setFile] = useState<File | null>(null);
  const [canShare, setCanShare] = useState(false);
  useEffect(() => {
    if (id == null || !number) return;
    let alive = true;
    fetch(`/api/admin/invoices/${id}/pdf`)
      .then((r) => (r.ok ? r.blob() : Promise.reject()))
      .then((b) => {
        if (!alive) return;
        const f = new File([b], `Facture-${number}.pdf`, { type: "application/pdf" });
        setFile(f);
        setCanShare(Boolean(navigator.canShare?.({ files: [f] })));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [id, number]);

  const share = async () => {
    if (id == null || !number) return;
    const f: File =
      file ??
      new File([await fetch(`/api/admin/invoices/${id}/pdf`).then((r) => r.blob())], `Facture-${number}.pdf`, {
        type: "application/pdf",
      });
    if (navigator.canShare?.({ files: [f] })) {
      try {
        await navigator.share({ files: [f], title: `Facture ${number}` });
        return;
      } catch (e) {
        if ((e as Error)?.name === "AbortError") return; // partage annulé
      }
    }
    const url = URL.createObjectURL(f);
    const a = document.createElement("a");
    a.href = url;
    a.download = f.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };
  return { share, canShare, ready: Boolean(file) };
}

/**
 * Facture à l'écran. Brouillon : « Modifier » (retour au panier) ou « Confirmer » (enregistrée dans
 * l'historique, numérotée). Confirmée : « Modifier » (la remet dans le panier), PDF (partage / téléchargement),
 * « Imprimer ».
 */
export function InvoiceModal({
  doc,
  onClose,
  onPrint,
  onModify,
  onConfirm,
  onEdit,
  confirmLabel = "Confirmer",
  busy,
  error,
  changes,
}: {
  doc: InvoiceDoc;
  onClose: () => void;
  onPrint: () => void;
  /** Brouillon : retour au panier. */
  onModify?: () => void;
  onConfirm?: () => void;
  /** Confirmée : la remettre dans le panier pour la modifier. */
  onEdit?: () => void;
  confirmLabel?: string;
  busy?: boolean;
  error?: string;
  /** Modification : prix unitaires qui ont changé depuis la facture d'origine. */
  changes?: { name: string; variant: string | null; before: number; after: number }[];
}) {
  const draft = doc.number == null;
  const pdf = usePdf(doc.id, doc.number);
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
            <span className="invoice-status draft">{doc.editing ? `Modification · ${doc.editing}` : "Brouillon"}</span>
          ) : (
            <span className="invoice-status ok">
              <CheckIcon size={15} /> Confirmée · {doc.number}
            </span>
          )}
          <span className="invoice-bar-actions">
            {draft ? (
              <>
                <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={onModify ?? onClose}>
                  <PencilIcon size={15} /> Modifier
                </button>
                <button type="button" className="btn btn-gold btn-sm" disabled={busy} onClick={onConfirm}>
                  <CheckIcon size={16} /> {busy ? "Enregistrement…" : confirmLabel}
                </button>
              </>
            ) : (
              <>
                {onEdit && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={onEdit}>
                    <PencilIcon size={15} /> Modifier
                  </button>
                )}
                {doc.id != null && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={pdf.share} title="Fichier PDF de la facture">
                    <ShareIcon size={15} /> {pdf.canShare ? "Partager PDF" : "Télécharger PDF"}
                  </button>
                )}
                <button type="button" className="btn btn-gold btn-sm" onClick={onPrint}>
                  <PrinterIcon size={16} /> Imprimer
                </button>
              </>
            )}
            {!draft && (
              <button type="button" className="icon-btn invoice-close" onClick={onClose} aria-label="Fermer">
                <CloseIcon size={14} />
              </button>
            )}
          </span>
        </div>
        {error && <p className="notice warn invoice-error">{error}</p>}
        {draft && changes && changes.length > 0 && (
          <div className="invoice-changes">
            <strong>
              Prix changé{changes.length > 1 ? "s" : ""} depuis la facture d&apos;origine ({changes.length}) :
            </strong>
            <ul>
              {changes.map((c) => (
                <li key={`${c.name}${c.variant}`}>
                  {c.name}
                  {c.variant ? ` · ${c.variant}` : ""} : <s>{formatDH(c.before)}</s> → <strong>{formatDH(c.after)}</strong>
                </li>
              ))}
            </ul>
          </div>
        )}
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
