"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CITY_MAX } from "@/lib/cities";
import { fold } from "@/lib/format";
import { keepVisible } from "./scroll";
import { CheckIcon, ChevronIcon, PinIcon, SearchIcon } from "./Icons";

type Props = {
  value: string | null;
  /** Villes proposées (grandes villes du Maroc + villes déjà saisies). */
  choices: string[];
  onChange: (city: string | null) => void;
  disabled?: boolean;
};

/** Choix d'une ville avec recherche ; une ville absente de la liste peut être ajoutée. */
export function CityPicker({ value, choices, onChange, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  const typed = query.trim().replace(/\s+/g, " ");
  const shown = useMemo(() => {
    const q = fold(typed);
    return q ? choices.filter((c) => fold(c).includes(q)) : choices;
  }, [choices, typed]);
  // Proposer d'ajouter la ville tapée si elle n'existe pas encore.
  const canAdd = typed !== "" && typed.length <= CITY_MAX && !choices.some((c) => fold(c) === fold(typed));
  // Les villes trouvées d'abord (Entrée choisit la première), « Ajouter » en dernier.
  const entries: { city: string | null; add?: boolean }[] = [
    ...(value && !typed ? [{ city: null }] : []),
    ...shown.map((city) => ({ city })),
    ...(canAdd ? [{ city: typed, add: true }] : []),
  ];

  const close = () => {
    setOpen(false);
    setQuery("");
  };
  const pick = (city: string | null) => {
    onChange(city);
    close();
  };

  useEffect(() => {
    if (!open) return;
    setActive(0);
    input.current?.focus();
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) close();
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  useEffect(() => {
    const ul = root.current?.querySelector<HTMLElement>(".opt-list") ?? null;
    keepVisible(ul, ul?.querySelector<HTMLElement>(`[data-index="${active}"]`));
  }, [active]);

  return (
    <div className="opt-picker city-picker" ref={root}>
      <button
        type="button"
        className="admin-input city-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => (open ? close() : setOpen(true))}
      >
        <PinIcon size={15} />
        <span className={value ? "city-value" : "city-value city-empty"}>{value ?? "Ville"}</span>
        <ChevronIcon size={15} className="opt-chevron" />
      </button>

      {open && (
        <div
          className="opt-pop"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              close();
            } else if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((i) => Math.min(i + 1, entries.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              if (entries[active]) pick(entries[active].city);
            }
          }}
        >
          <label className="opt-search">
            <SearchIcon size={16} />
            <input
              ref={input}
              type="search"
              value={query}
              maxLength={CITY_MAX}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              placeholder="Chercher ou ajouter une ville…"
              aria-label="Chercher ou ajouter une ville"
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <ul className="opt-list" role="listbox" aria-label="Villes">
            {entries.map((e, i) => (
              <li
                key={e.add ? "+" : (e.city ?? "-")}
                role="option"
                aria-selected={e.city === value}
                data-index={i}
                data-active={i === active}
                className={e.add ? "city-add" : e.city == null ? "city-none" : undefined}
                onPointerEnter={() => setActive(i)}
                onClick={() => pick(e.city)}
              >
                <span className="opt-item-name">
                  {e.add ? `+ Ajouter « ${e.city} »` : (e.city ?? "Aucune ville")}
                </span>
                <span className="opt-item-check">{!e.add && e.city === value && <CheckIcon size={16} />}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
