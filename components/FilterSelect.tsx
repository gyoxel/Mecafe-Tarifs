"use client";

import { useEffect, useId, useRef, useState } from "react";
import { CheckIcon, ChevronIcon } from "./Icons";
import { keepVisible } from "./scroll";

/**
 * Liste déroulante au style du site : bouton, puis menu ouvert juste en dessous (première entrée = « tous »).
 * Clavier : flèches, Entrée, Échap (sans fermer la fenêtre autour).
 */
export function FilterSelect({
  values: cities,
  value,
  onChange,
  allLabel,
  label,
  icon,
}: {
  values: string[];
  value: string | null;
  onChange: (value: string | null) => void;
  allLabel: string;
  label: string;
  icon: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const entries = [null, ...cities];
  const [active, setActive] = useState(-1);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLUListElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    setActive(-1);
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (open) keepVisible(menu.current, menu.current?.querySelector<HTMLElement>(`[data-index="${active}"]`));
  }, [open, active]);

  const pick = (c: string | null) => {
    onChange(c);
    setOpen(false);
    button.current?.focus();
  };

  return (
    <div
      className="city-filter"
      ref={root}
      data-filtered={value != null}
      onKeyDown={(e) => {
        // Le menu garde ses touches pour lui (une liste autour ne réagit pas).
        if (!open) {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            e.stopPropagation();
            setOpen(true);
          }
          return;
        }
        if (["Escape", "ArrowDown", "ArrowUp", "Enter"].includes(e.key)) {
          e.preventDefault();
          e.stopPropagation();
        }
        if (e.key === "Escape") {
          setOpen(false);
          button.current?.focus();
        } else if (e.key === "ArrowDown") setActive((i) => Math.min(i + 1, entries.length - 1));
        else if (e.key === "ArrowUp") setActive((i) => Math.max(i - 1, 0));
        else if (e.key === "Enter" && active >= 0) pick(entries[active]);
      }}
    >
      <button
        ref={button}
        type="button"
        className="city-filter-btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={`${label} : ${value ?? allLabel}`}
        onClick={() => setOpen((o) => !o)}
      >
        {icon}
        <span className="city-filter-value">{value ?? allLabel}</span>
        <ChevronIcon size={15} className="opt-chevron" />
      </button>
      {open && (
        <ul
          className="city-menu"
          role="listbox"
          id={menuId}
          aria-label={label}
          ref={menu}
          onPointerLeave={() => setActive(-1)}
        >
          {entries.map((c, i) => (
            <li
              key={c ?? "*"}
              role="option"
              aria-selected={c === value}
              data-index={i}
              data-active={i === active}
              onPointerEnter={(e) => e.pointerType === "mouse" && setActive(i)}
              onClick={() => pick(c)}
            >
              <span className="opt-item-name">{c ?? allLabel}</span>
              <span className="opt-item-check">{c === value && <CheckIcon size={16} />}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
