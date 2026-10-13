"use client";

import { CloseIcon, PencilIcon } from "./Icons";

/** Petit crayon dans le coin du prix revendeur : ouvre la saisie du prix pour ce produit. */
export function PriceEditButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className="price-edit-btn"
      onClick={onClick}
      aria-label={`Modifier le prix : ${label}`}
      title="Modifier le prix"
    >
      <PencilIcon size={13} />
    </button>
  );
}

/**
 * Saisie du prix revendeur d'un produit, depuis le catalogue. La valeur reste en attente (barre flottante
 * « Enregistrer / Annuler ») : on peut en modifier plusieurs avant d'enregistrer.
 */
export function PriceDraftInput({
  value,
  invalid,
  changed,
  label,
  hint,
  onChange,
  onCancel,
}: {
  value: string;
  invalid: boolean;
  /** Différent du prix enregistré. */
  changed: boolean;
  label: string;
  /** Repère affiché à gauche sur téléphone (la saisie prend toute la barre) : le prix du site. */
  hint?: string;
  onChange: (text: string) => void;
  onCancel: () => void;
}) {
  return (
    <span className="price-edit" data-invalid={invalid} data-changed={changed}>
      {hint && <span className="price-edit-hint">{hint}</span>}
      <span className="price-edit-field">
        <input
          className="price-edit-input"
          value={value}
          inputMode="decimal"
          placeholder="—"
          autoFocus
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") onCancel();
          }}
          aria-label={`Nouveau prix : ${label}`}
          aria-invalid={invalid}
        />
        <span className="price-edit-cur">DH</span>
      </span>
      <button
        type="button"
        className="price-edit-cancel"
        onClick={onCancel}
        aria-label="Ne pas modifier ce prix"
        title="Ne pas modifier"
      >
        <CloseIcon size={11} />
      </button>
    </span>
  );
}
