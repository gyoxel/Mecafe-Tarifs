"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { fold } from "@/lib/format";
import { formatOffset, matchesOption, type PriceOption } from "@/lib/options";
import { CheckIcon, ChevronIcon, SearchIcon, TagIcon } from "./Icons";

type Props = {
  options: PriceOption[];
  value: string;
  onChange: (id: string) => void;
  /** Nom lu par les lecteurs d'écran et affiché en tête de liste. */
  label: string;
  className?: string;
};

/**
 * Liste déroulante des options de prix : recherche par nom ou ville, filtre par ville.
 * L'écart n'apparaît pas dans la liste, seulement à côté de l'option choisie.
 */
export function OptionPicker({ options, value, onChange, label, className }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [city, setCity] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const listId = useId();

  const current = options.find((o) => o.id === value) ?? options[0];
  // Villes présentes dans les options (filtre), triées.
  const cities = useMemo(() => {
    const m = new Map<string, string>();
    for (const o of options) if (o.city && !m.has(fold(o.city))) m.set(fold(o.city), o.city);
    return [...m.values()].sort((a, b) => fold(a).localeCompare(fold(b)));
  }, [options]);
  const shown = useMemo(
    () => options.filter((o) => (!city || (o.city && fold(o.city) === fold(city))) && matchesOption(o, query)),
    [options, query, city],
  );

  const close = (focusTrigger = false) => {
    setOpen(false);
    setQuery("");
    setCity(null);
    if (focusTrigger) trigger.current?.focus();
  };
  const pick = (o: PriceOption) => {
    onChange(o.id);
    close(true);
  };

  useEffect(() => {
    if (!open) return;
    setActive(Math.max(0, options.findIndex((o) => o.id === value)));
    // Sur écran tactile, pas de clavier imposé : on touche le champ pour chercher.
    if (window.matchMedia("(hover: hover)").matches) input.current?.focus();
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) close();
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close(true);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, shown.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && shown[active]) {
      e.preventDefault();
      pick(shown[active]);
    }
  };

  return (
    <div className={`opt-picker ${className ?? ""}`} ref={root}>
      <button
        ref={trigger}
        type="button"
        className="opt-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${label} : ${current?.name ?? "aucune"}`}
        title={current ? `${current.name} : prix site ${formatOffset(current.offset)}` : undefined}
        onClick={() => (open ? close() : setOpen(true))}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        <TagIcon size={16} className="opt-trigger-icon" />
        <span className="opt-trigger-name">{current?.name ?? "—"}</span>
        {current && <span className="opt-trigger-offset">{formatOffset(current.offset)}</span>}
        <ChevronIcon size={16} className="opt-chevron" />
      </button>

      {open && (
        <div className="opt-pop" onKeyDown={onKeyDown}>
          <p className="opt-pop-title">{label}</p>
          <label className="opt-search">
            <SearchIcon size={16} />
            <input
              ref={input}
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              placeholder={cities.length ? "Rechercher un nom, une ville…" : "Rechercher un nom…"}
              aria-label="Rechercher une option"
              aria-controls={listId}
              autoComplete="off"
              spellCheck={false}
              enterKeyHint="done"
            />
          </label>
          {cities.length > 0 && (
            <div className="opt-cities" role="group" aria-label="Filtrer par ville">
              {[null, ...cities].map((c) => (
                <button
                  key={c ?? "*"}
                  type="button"
                  className="opt-city"
                  aria-pressed={city === c}
                  onClick={() => {
                    setCity(city === c ? null : c);
                    setActive(0);
                  }}
                >
                  {c ?? "Toutes les villes"}
                </button>
              ))}
            </div>
          )}
          <ul className="opt-list" role="listbox" id={listId} aria-label={label} ref={list}>
            {shown.map((o, i) => (
              <li
                key={o.id}
                role="option"
                aria-selected={o.id === value}
                data-index={i}
                data-active={i === active}
                onPointerEnter={() => setActive(i)}
                onClick={() => pick(o)}
              >
                <span className="opt-item-text">
                  <span className="opt-item-name">{o.name}</span>
                  {o.city && <span className="opt-item-city">{o.city}</span>}
                </span>
                <span className="opt-item-check">{o.id === value && <CheckIcon size={16} />}</span>
              </li>
            ))}
            {shown.length === 0 && (
              <li className="opt-empty">
                Aucune option{query.trim() ? ` « ${query.trim()} »` : ""}
                {city ? ` à ${city}` : ""}
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
