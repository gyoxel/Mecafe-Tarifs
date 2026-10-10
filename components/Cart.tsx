"use client";

import { useEffect, useRef, useState } from "react";
import { QTY_MAX, cartTotal, parseQty, type ResolvedLine } from "@/lib/cart";
import { formatDH } from "@/lib/format";
import { displayTitle, displayVariant } from "@/lib/title";
import { CartIcon, ChevronIcon, CloseIcon, FileTextIcon, MinusIcon, PencilIcon, PlusIcon, PrinterIcon, TrashIcon } from "./Icons";
import { Price } from "./Price";
import { Thumb } from "./Thumb";
import { lockScroll } from "./scroll";

/* ─────────────── Quantité : − [n] + (saisie directe possible) ─────────────── */

export function QtyStepper({
  qty,
  onQty,
  label,
  autoFocus,
  trashAtOne = true,
}: {
  qty: number;
  onQty: (qty: number) => void;
  label: string;
  autoFocus?: boolean;
  /** À 1, « − » devient une corbeille (sur la carte) ; dans le panier, la corbeille est à part. */
  trashAtOne?: boolean;
}) {
  const [text, setText] = useState(String(qty));
  useEffect(() => setText(String(qty)), [qty]);
  const commit = () => {
    const n = parseQty(text);
    if (n == null) setText(String(qty));
    else onQty(n); // 0 = retirer du panier
  };
  return (
    <span className="qty" role="group" aria-label={`Quantité : ${label}`}>
      <button type="button" className="qty-btn" onClick={() => onQty(qty - 1)} aria-label="Retirer un">
        {trashAtOne && qty <= 1 ? <TrashIcon size={14} /> : <MinusIcon size={14} />}
      </button>
      <input
        className="qty-input"
        value={text}
        inputMode="numeric"
        autoFocus={autoFocus}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => setText(e.target.value.replace(/\D/g, "").slice(0, 4))}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        aria-label="Quantité"
      />
      <button
        type="button"
        className="qty-btn"
        onClick={() => onQty(Math.min(qty + 1, QTY_MAX))}
        aria-label="Ajouter un"
      >
        <PlusIcon size={14} />
      </button>
    </span>
  );
}

/* ─────────────── Sur la carte : « + », puis le nombre, puis − n + ─────────────── */

export function CartControl({
  qty,
  onQty,
  label,
  inline,
}: {
  qty: number;
  onQty: (qty: number) => void;
  label: string;
  /** Vue liste : dans la ligne au lieu d'être posé sur l'image. */
  inline?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);
  useEffect(() => {
    if (qty === 0) setOpen(false);
  }, [qty]);

  return (
    <div className={`cart-ctl ${inline ? "cart-ctl-inline" : ""}`} ref={root} data-open={open}>
      {qty === 0 ? (
        <button type="button" className="cart-add" onClick={() => onQty(1)} aria-label={`Ajouter au panier : ${label}`}>
          <PlusIcon size={18} />
        </button>
      ) : open ? (
        <QtyStepper qty={qty} onQty={onQty} label={label} />
      ) : (
        <button
          type="button"
          className="cart-count"
          onClick={() => setOpen(true)}
          aria-label={`${qty} au panier : ${label}. Modifier la quantité`}
        >
          {qty}
        </button>
      )}
    </div>
  );
}

/* ─────────────── Contenu du panier (panneau bureau et fenêtre mobile) ─────────────── */

type PanelProps = {
  lines: ResolvedLine[];
  commercial: string;
  lastAdded: string | null;
  onQty: (id: string, qty: number) => void;
  onClear: () => void;
  onInvoice: () => void;
  onPrint: () => void;
  onClose: () => void;
  /** Mobile : fenêtre qui se descend (poignée en haut). */
  sheet?: boolean;
  /** N° de la facture confirmée en cours de modification, ou null. */
  editing?: string | null;
  /** Message d'erreur (aperçu de la facture refusé…). */
  error?: string;
  /** Aperçu de la facture en cours de calcul. */
  busy?: boolean;
};

export function CartPanel({
  lines,
  commercial,
  lastAdded,
  onQty,
  onClear,
  onInvoice,
  onPrint,
  onClose,
  sheet,
  editing,
  error,
  busy,
}: PanelProps) {
  const count = lines.reduce((n, l) => n + l.qty, 0);
  const total = cartTotal(lines);
  // Toujours le prix du commercial : un produit sans prix commercial bloque la facture.
  const missing = lines.filter((l) => l.unit == null);

  return (
    <div className="cart-panel-inner">
      <div className="cart-head">
        <div>
          <h2 className="cart-title">
            Panier <span className="cart-title-count">{count}</span>
          </h2>
          <p className="cart-sub">Prix : {commercial}</p>
        </div>
        <span className="cart-head-actions">
          <button
            type="button"
            className="link-btn cart-clear"
            onClick={() => {
              if (window.confirm("Vider le panier ?")) onClear();
            }}
          >
            Vider
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label={sheet ? "Descendre le panier" : "Réduire le panier"}
            title={sheet ? "Descendre" : "Réduire"}
          >
            {sheet ? <ChevronIcon size={16} /> : <CloseIcon size={14} />}
          </button>
        </span>
      </div>

      {editing && (
        <div className="cart-editing">
          <PencilIcon size={15} />
          <span>
            Modification de la facture <strong>{editing}</strong>
          </span>
          <button
            type="button"
            className="link-btn"
            onClick={() => {
              if (window.confirm(`Annuler la modification de ${editing} ? La facture reste telle quelle.`)) onClear();
            }}
          >
            Annuler
          </button>
        </div>
      )}

      <ul className="cart-lines">
        {lines.map((l) => {
          const name = displayTitle(l.item.title, l.item.brand);
          return (
            <li key={l.item.id} className="cart-line" data-new={l.item.id === lastAdded}>
              <span className="cart-thumb">
                <Thumb src={l.item.image} alt="" brand={l.item.brand} small />
              </span>
              <span className="cart-line-main">
                <span className="cart-line-brand">{l.item.brand}</span>
                <span className="cart-line-name" title={l.item.title}>
                  {name}
                </span>
                <span className="cart-line-meta">
                  {l.item.variant && <span className="cart-line-variant">{displayVariant(l.item.variant)}</span>}
                  {l.unit == null ? (
                    <span className="cart-line-missing">Pas de prix revendeur</span>
                  ) : (
                    <span className="cart-line-unit">{formatDH(l.unit)}</span>
                  )}
                </span>
              </span>
              <span className="cart-line-side">
                <button
                  type="button"
                  className="cart-remove"
                  onClick={() => onQty(l.item.id, 0)}
                  aria-label={`Retirer ${name} du panier`}
                  title="Retirer"
                >
                  <TrashIcon size={15} />
                </button>
                <QtyStepper qty={l.qty} onQty={(q) => onQty(l.item.id, q)} label={name} trashAtOne={false} />
                <span className="cart-line-total">{l.unit == null ? "—" : formatDH(l.total)}</span>
              </span>
            </li>
          );
        })}
      </ul>

      <div className="cart-foot">
        {missing.length > 0 && (
          <p className="cart-warn">
            {missing.length} produit{missing.length > 1 ? "s" : ""} sans prix revendeur pour {commercial} : retirez-
            {missing.length > 1 ? "les" : "le"} ou définissez le prix dans Gestion › Prix des produits.
          </p>
        )}
        {error && <p className="cart-warn">{error}</p>}
        <div className="cart-total">
          <span>
            Total <span className="cart-total-count">· {count} article{count > 1 ? "s" : ""}</span>
          </span>
          <Price value={total} />
        </div>
        <div className="cart-actions">
          <button type="button" className="btn cart-btn" onClick={onInvoice} disabled={busy || missing.length > 0}>
            <FileTextIcon size={17} /> {busy ? "Calcul…" : "Voir la facture"}
          </button>
          <button type="button" className="btn btn-gold cart-btn" onClick={onPrint} disabled={busy || missing.length > 0}>
            <PrinterIcon size={17} /> Imprimer la facture
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────── Mobile : bouton panier en bas à droite ─────────────── */

export function CartFab({ count, bump, onClick }: { count: number; bump: number; onClick: () => void }) {
  return (
    <button type="button" className="cart-fab" onClick={onClick} aria-label={`Ouvrir le panier (${count})`}>
      <span key={bump} className={bump ? "cart-fab-icon bump" : "cart-fab-icon"}>
        <CartIcon size={24} />
      </span>
      <span key={`b${bump}`} className={bump ? "cart-fab-badge pop" : "cart-fab-badge"}>
        {count}
      </span>
    </button>
  );
}

/** Mobile : grande fenêtre du panier, qu'on descend par la poignée (ou en la glissant vers le bas). */
export function CartSheet({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  const [drag, setDrag] = useState(0);
  const start = useRef<number | null>(null);

  useEffect(() => {
    const unlock = lockScroll();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      unlock();
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div className="cart-sheet-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="cart-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Panier"
        style={drag ? { transform: `translateY(${drag}px)`, transition: "none" } : undefined}
      >
        <div
          className="cart-sheet-grip"
          onPointerDown={(e) => {
            start.current = e.clientY;
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => start.current != null && setDrag(Math.max(0, e.clientY - start.current))}
          onPointerUp={() => {
            const d = drag;
            start.current = null;
            setDrag(0);
            if (d > 90) onClose();
          }}
          onClick={() => drag === 0 && onClose()}
          aria-hidden="true"
        >
          <span />
        </div>
        {children}
      </div>
    </div>
  );
}
