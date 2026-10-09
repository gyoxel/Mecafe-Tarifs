"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { fold } from "@/lib/format";
import { formatOffset, matchesOption, type PriceOption } from "@/lib/options";
import { keepVisible } from "./scroll";
import { CheckIcon, ChevronIcon, PinIcon, SearchIcon, TagIcon } from "./Icons";

/**
 * Liste des commerciaux : recherche par nom ou ville, filtre par ville, navigation au clavier.
 * L'écart n'apparaît pas dans la liste (seulement à côté du commercial choisi).
 */
export function OptionList({
  options,
  value,
  onPick,
  label,
  autoFocus,
}: {
  options: PriceOption[];
  value: string | null;
  onPick: (o: PriceOption) => void;
  label: string;
  autoFocus?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [city, setCity] = useState<string | null>(null);
  // Ligne en surbrillance (souris ou clavier) ; -1 = aucune : le gris suit le curseur et disparaît quand il sort.
  const [active, setActive] = useState(-1);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const listId = useId();

  // Villes présentes dans la liste (filtre), triées.
  const cities = useMemo(() => {
    const m = new Map<string, string>();
    for (const o of options) if (o.city && !m.has(fold(o.city))) m.set(fold(o.city), o.city);
    return [...m.values()].sort((a, b) => fold(a).localeCompare(fold(b)));
  }, [options]);
  const shown = useMemo(
    () => options.filter((o) => (!city || (o.city && fold(o.city) === fold(city))) && matchesOption(o, query)),
    [options, query, city],
  );

  useEffect(() => {
    // Sur écran tactile, pas de clavier imposé : on touche le champ pour chercher.
    if (autoFocus && window.matchMedia("(hover: hover)").matches) input.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    keepVisible(list.current, list.current?.querySelector<HTMLElement>(`[data-index="${active}"]`));
  }, [active]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, shown.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && shown[active]) {
      e.preventDefault();
      onPick(shown[active]);
    }
  };

  return (
    <div className="opt-listbox" onKeyDown={onKeyDown}>
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
          aria-label="Rechercher un commercial"
          aria-controls={listId}
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="done"
        />
      </label>
      {/* Filtre par ville : liste déroulante qui s'ouvre sous le bouton, toutes les villes visibles. */}
      {cities.length > 0 && (
        <CityFilter
          cities={cities}
          value={city}
          onChange={(c) => {
            setCity(c);
            setActive(-1);
          }}
        />
      )}
      <ul
        className="opt-list"
        role="listbox"
        id={listId}
        aria-label={label}
        ref={list}
        onPointerLeave={() => setActive(-1)}
      >
        {shown.map((o, i) => (
          <li
            key={o.id}
            role="option"
            aria-selected={o.id === value}
            data-index={i}
            data-active={i === active}
            onPointerEnter={() => setActive(i)}
            onClick={() => onPick(o)}
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
            Aucun commercial{query.trim() ? ` « ${query.trim()} »` : ""}
            {city ? ` à ${city}` : ""}
          </li>
        )}
      </ul>
    </div>
  );
}

/** Filtre par ville : bouton + menu au style du site, ouvert juste en dessous. */
function CityFilter({
  cities,
  value,
  onChange,
}: {
  cities: string[];
  value: string | null;
  onChange: (city: string | null) => void;
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
      data-active={value != null}
      onKeyDown={(e) => {
        // Le menu garde ses touches pour lui (la liste des commerciaux autour ne réagit pas).
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
        aria-label={`Filtrer par ville : ${value ?? "toutes les villes"}`}
        onClick={() => setOpen((o) => !o)}
      >
        <PinIcon size={15} />
        <span className="city-filter-value">{value ?? "Toutes les villes"}</span>
        <ChevronIcon size={15} className="opt-chevron" />
      </button>
      {open && (
        <ul
          className="city-menu"
          role="listbox"
          id={menuId}
          aria-label="Villes"
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
              onPointerEnter={() => setActive(i)}
              onClick={() => pick(c)}
            >
              <span className="opt-item-name">{c ?? "Toutes les villes"}</span>
              <span className="opt-item-check">{c === value && <CheckIcon size={16} />}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Bouton affichant le commercial choisi, avec son écart en petit. */
export function OptionTrigger({
  option,
  open,
  onClick,
  label,
  triggerRef,
}: {
  option: PriceOption | undefined;
  open: boolean;
  onClick: () => void;
  label: string;
  triggerRef?: React.Ref<HTMLButtonElement>;
}) {
  return (
    <button
      ref={triggerRef}
      type="button"
      className="opt-trigger"
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-label={`${label} : ${option?.name ?? "aucun"}`}
      title={option ? `${option.name} : prix site ${formatOffset(option.offset)}` : undefined}
      onClick={onClick}
    >
      <TagIcon size={16} className="opt-trigger-icon" />
      <span className="opt-trigger-name">{option?.name ?? "Choisir…"}</span>
      {option && <span className="opt-trigger-offset">{formatOffset(option.offset)}</span>}
      <ChevronIcon size={16} className="opt-chevron" />
    </button>
  );
}

/** Liste déroulante des commerciaux (barre du haut de l'admin, page Gestion). */
export function OptionPicker({
  options,
  value,
  onChange,
  label,
}: {
  options: PriceOption[];
  value: string;
  onChange: (id: string) => void;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const current = options.find((o) => o.id === value);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  return (
    <div className="opt-picker" ref={root}>
      <OptionTrigger option={current} open={open} onClick={() => setOpen((o) => !o)} label={label} triggerRef={trigger} />
      {open && (
        <div
          className="opt-pop"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              setOpen(false);
              trigger.current?.focus();
            }
          }}
        >
          <p className="opt-pop-title">{label}</p>
          <OptionList
            options={options}
            value={value}
            label={label}
            autoFocus
            onPick={(o) => {
              onChange(o.id);
              setOpen(false);
              trigger.current?.focus();
            }}
          />
        </div>
      )}
    </div>
  );
}
