"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
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

/** Liste déroulante des options de prix, avec recherche par nom (utile quand les noms se multiplient). */
export function OptionPicker({ options, value, onChange, label, className }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const listId = useId();

  const current = options.find((o) => o.id === value) ?? options[0];
  const shown = useMemo(() => options.filter((o) => matchesOption(o, query)), [options, query]);

  const close = (focusTrigger = false) => {
    setOpen(false);
    setQuery("");
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
              placeholder="Rechercher un nom…"
              aria-label="Rechercher une option"
              aria-controls={listId}
              autoComplete="off"
              spellCheck={false}
              enterKeyHint="done"
            />
          </label>
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
                <span className="opt-item-name">{o.name}</span>
                <span className="opt-item-offset">{formatOffset(o.offset)}</span>
                <span className="opt-item-check">{o.id === value && <CheckIcon size={16} />}</span>
              </li>
            ))}
            {shown.length === 0 && <li className="opt-empty">Aucune option « {query.trim()} »</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
