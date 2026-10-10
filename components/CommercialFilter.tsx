"use client";

import { useEffect, useRef, useState } from "react";
import type { PriceOption } from "@/lib/options";
import { ChevronIcon, CloseIcon, UsersIcon } from "./Icons";
import { OptionList } from "./OptionPicker";

/**
 * Filtre « commercial » : bouton, puis la même liste que pour choisir un commercial
 * (recherche par nom ou ville, liste des villes), avec « Tous les commerciaux » en tête.
 */
export function CommercialFilter({
  options,
  value,
  onChange,
}: {
  options: PriceOption[];
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const current = options.find((o) => o.id === value) ?? null;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const pick = (id: string | null) => {
    onChange(id);
    setOpen(false);
    button.current?.focus();
  };

  return (
    <div className="opt-picker commercial-filter" ref={root} data-filtered={current != null}>
      <button
        ref={button}
        type="button"
        className="city-filter-btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Filtrer par revendeur : ${current?.name ?? "tous"}`}
        onClick={() => setOpen((o) => !o)}
      >
        <UsersIcon size={15} />
        <span className="city-filter-value">
          {current ? current.name : "Tous les revendeurs"}
          {current?.city && <span className="commercial-filter-city"> · {current.city}</span>}
        </span>
        {current ? (
          <span
            role="button"
            tabIndex={-1}
            className="commercial-filter-clear"
            aria-label="Retirer le filtre"
            onClick={(e) => {
              e.stopPropagation();
              pick(null);
            }}
          >
            <CloseIcon size={12} />
          </span>
        ) : (
          <ChevronIcon size={15} className="opt-chevron" />
        )}
      </button>
      {open && (
        <div
          className="opt-pop commercial-filter-pop"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              setOpen(false);
              button.current?.focus();
            }
          }}
        >
          <button type="button" className="commercial-filter-all" aria-pressed={value == null} onClick={() => pick(null)}>
            Tous les revendeurs
          </button>
          <OptionList options={options} value={value} onPick={(o) => pick(o.id)} label="Revendeurs" autoFocus />
        </div>
      )}
    </div>
  );
}
