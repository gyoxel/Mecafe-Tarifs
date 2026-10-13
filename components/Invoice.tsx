"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { invoiceDate } from "@/lib/cart";
import { formatDH } from "@/lib/format";
import { KIND_LABEL, sumRows, type DocKind, type InvoiceRow, type SavedInvoice } from "@/lib/invoice-types";
import { CheckIcon, CloseIcon, PencilIcon, PrinterIcon, ShareIcon } from "./Icons";
import { lockScroll } from "./scroll";

/** Ce qu'affiche un devis ou une commande : brouillon (pas de n°) ou confirmé. */
export type InvoiceDoc = {
  /** Devis ou commande : titre du document. */
  kind: DocKind;
  rows: InvoiceRow[];
  commercial: string;
  city: string | null;
  phone?: string | null;
  /** null = brouillon, pas encore confirmé (pas de n°). */
  number: string | null;
  date: Date;
  /** Devis enregistré : id (PDF, modification), commercial d'origine, date de modification. */
  id?: number;
  commercialId?: string | null;
  updatedAt?: Date | null;
  /** Brouillon qui modifie un devis existant : son n°. */
  editing?: string;
};

/** Devis enregistré → document affichable. */
export const docOf = (inv: SavedInvoice): InvoiceDoc => ({
  kind: inv.kind,
  rows: inv.rows,
  commercial: inv.commercial,
  city: inv.city,
  phone: inv.phone,
  number: inv.number,
  date: new Date(inv.createdAt),
  id: inv.id,
  commercialId: inv.commercialId,
  updatedAt: inv.updatedAt ? new Date(inv.updatedAt) : null,
});

/**
 * Devis sur l'en-tête officiel de Mécafé (public/entete.svg, copie de assets/devis/entete.pdf).
 * Écran : haut et bas de l'en-tête, feuille au moins aussi haute qu'une page A4.
 * Impression : l'en-tête entier est fixé sur chaque page A4 ; les lignes du cadre (thead / tfoot répétés)
 * réservent sa place en haut et en bas de chaque page, le contenu s'écrit entre les deux.
 */
export function Invoice({ doc }: { doc: InvoiceDoc }) {
  const { count, total } = sumRows(doc.rows);
  const anySite = doc.rows.some((r) => r.sitePrice);
  return (
    <article className="invoice" data-draft={doc.number == null}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="invoice-lh-print" src="/entete.svg" alt="" />
      <div className="invoice-lh-head" aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/entete.svg" alt="" />
      </div>
      <table className="invoice-frame">
        <thead>
          <tr>
            <td>
              <div className="invoice-frame-top" />
            </td>
          </tr>
        </thead>
        <tfoot>
          <tr>
            <td>
              <div className="invoice-frame-bottom" />
            </td>
          </tr>
        </tfoot>
        <tbody>
          <tr>
            <td className="invoice-body">
              <header className="invoice-head">
                <div>
                  <h2>{KIND_LABEL[doc.kind]}</h2>
                  <span className="invoice-head-bar" />
                </div>
                <div className="invoice-id">
                  {doc.number ? (
                    <p className="invoice-number">N° {doc.number}</p>
                  ) : doc.editing ? (
                    <p className="invoice-draft">Modification de {doc.editing} · non enregistrée</p>
                  ) : (
                    <p className="invoice-draft">Brouillon · non confirmé</p>
                  )}
                  <p>Date : {invoiceDate(doc.date)}</p>
                  {doc.updatedAt && <p className="invoice-updated">Modifié le {invoiceDate(doc.updatedAt)}</p>}
                </div>
              </header>

              <div className="invoice-party">
                <span className="invoice-label">Client</span>
                <strong>{doc.commercial}</strong>
                {doc.city && <span>{doc.city}</span>}
                {doc.phone && <span className="invoice-phone">Tél : {doc.phone}</span>}
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
              {anySite && <p className="invoice-note">* Prix public (pas de prix revendeur pour ce produit).</p>}
            </td>
          </tr>
        </tbody>
      </table>
      <div className="invoice-lh-foot" aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/entete.svg" alt="" />
      </div>
    </article>
  );
}

/**
 * Partage le devis en PDF : feuille de partage du téléphone (WhatsApp, e-mail…) si le navigateur sait
 * partager un fichier, sinon téléchargement. Le PDF est préparé dès l'ouverture : le partage part tout de
 * suite au clic (certains navigateurs refusent un partage lancé après une attente).
 */
function usePdf(id: number | undefined, number: string | null, kind: DocKind) {
  const label = KIND_LABEL[kind];
  const [file, setFile] = useState<File | null>(null);
  const [canShare, setCanShare] = useState(false);
  useEffect(() => {
    if (id == null || !number) return;
    let alive = true;
    fetch(`/api/admin/invoices/${id}/pdf`)
      .then((r) => (r.ok ? r.blob() : Promise.reject()))
      .then((b) => {
        if (!alive) return;
        const f = new File([b], `${label}-${number}.pdf`, { type: "application/pdf" });
        setFile(f);
        setCanShare(Boolean(navigator.canShare?.({ files: [f] })));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [id, number, label]);

  const share = async () => {
    if (id == null || !number) return;
    const f: File =
      file ??
      new File([await fetch(`/api/admin/invoices/${id}/pdf`).then((r) => r.blob())], `${label}-${number}.pdf`, {
        type: "application/pdf",
      });
    if (navigator.canShare?.({ files: [f] })) {
      try {
        await navigator.share({ files: [f], title: `${label} ${number}` });
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
 * Devis à l'écran. Brouillon : « Modifier » (retour au panier) ou « Confirmer » (enregistrée dans
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
  /** Confirmé : le remettre dans le panier pour le modifier. */
  onEdit?: () => void;
  confirmLabel?: string;
  busy?: boolean;
  error?: string;
  /** Modification : prix unitaires qui ont changé depuis le devis d'origine. */
  changes?: { name: string; variant: string | null; before: number; after: number }[];
}) {
  const draft = doc.number == null;
  const pdf = usePdf(doc.id, doc.number, doc.kind);
  const label = KIND_LABEL[doc.kind];
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
      <div className="invoice-modal" role="dialog" aria-modal="true" aria-label={label}>
        <div className="invoice-bar">
          {draft ? (
            <span className="invoice-status draft">{doc.editing ? `Modification · ${doc.editing}` : "Brouillon"}</span>
          ) : (
            <span className="invoice-status ok">
              <CheckIcon size={15} /> {doc.kind === "commande" ? "Confirmée" : "Confirmé"} · {doc.number}
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
                  <button type="button" className="btn btn-ghost btn-sm" onClick={pdf.share} title={`Fichier PDF : ${label.toLowerCase()}`}>
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
              Prix changé{changes.length > 1 ? "s" : ""} depuis {doc.kind === "commande" ? "la commande" : "le devis"}{" "}
              d&apos;origine ({changes.length}) :
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
  if (doc.number) document.title = `${KIND_LABEL[doc.kind]} ${doc.number}`; // nom proposé pour « Enregistrer en PDF »
  window.print();
  document.title = title;
}
