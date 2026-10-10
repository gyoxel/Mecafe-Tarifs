"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { cityChoices } from "@/lib/cities";
import {
  BASE_ID,
  NAME_MAX,
  formatOffset,
  matchesOption,
  offsetInput,
  parseOffset,
  type PriceOption,
} from "@/lib/options";
import { CityPicker } from "./CityPicker";
import { GripIcon, PencilIcon, SearchIcon, TrashIcon } from "./Icons";
import { OffsetField } from "./OffsetField";

type Props = {
  options: PriceOption[];
  onOptions: (list: PriceOption[]) => void;
  onStatus: (s: { kind: "ok" | "error"; text: string }) => void;
};

async function send(body: Record<string, unknown>): Promise<PriceOption[]> {
  const res = await fetch("/api/admin/options", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string; options?: PriceOption[] };
  if (!res.ok || !data.options) throw new Error(data.error ?? `Erreur ${res.status}`);
  return data.options;
}

/** Exemple lisible de l'écart : « 165 DH → 155 DH ». */
function Example({ offset }: { offset: number | null }) {
  if (offset == null || Number.isNaN(offset)) return null;
  const site = 165;
  return (
    <span className="muted small opt-example">
      Ex. : {site} DH → {Math.max(0, site + offset)} DH
    </span>
  );
}

/** Formulaire d'un revendeur (modification en place). */
function EditRow({
  option,
  cities,
  busy,
  onSave,
  onCancel,
}: {
  option: PriceOption;
  cities: string[];
  busy: boolean;
  onSave: (name: string, city: string | null, offset: number) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(option.name);
  const [city, setCity] = useState(option.city);
  const [offset, setOffset] = useState(offsetInput(option.offset));
  const parsed = parseOffset(offset);
  const valid = name.trim() !== "" && parsed !== null && !Number.isNaN(parsed);
  return (
    <form
      className="rv-edit"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid && !busy) onSave(name.trim(), city, parsed!);
      }}
      onKeyDown={(e) => e.key === "Escape" && onCancel()}
    >
      <input
        className="admin-input rv-edit-name"
        value={name}
        maxLength={NAME_MAX}
        onChange={(e) => setName(e.target.value)}
        aria-label="Nom du revendeur"
        autoFocus
      />
      <CityPicker value={city} choices={cities} onChange={setCity} disabled={busy} />
      <OffsetField value={offset} onChange={setOffset} label={`Écart de ${option.name}`} />
      <span className="rv-edit-actions">
        <button type="submit" className="btn btn-gold btn-sm" disabled={busy || !valid}>
          Enregistrer
        </button>
        <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={onCancel}>
          Annuler
        </button>
      </span>
    </form>
  );
}

/**
 * Gestion des revendeurs : le tarif de base (« Revendeur », écart repris par les nouveaux), l'ajout, puis la
 * liste (nom cliquable / Modifier, Supprimer, poignée ⋮⋮ pour changer l'ordre en glissant).
 */
export function OptionsManager({ options, onOptions, onStatus }: Props) {
  const base = options.find((o) => o.id === BASE_ID) ?? null;
  const named = useMemo(() => options.filter((o) => o.id !== BASE_ID), [options]);
  const cities = useMemo(() => cityChoices(options.map((o) => o.city)), [options]);

  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("");
  const [editing, setEditing] = useState<string | null>(null);

  // Tarif de base
  const [baseOffset, setBaseOffset] = useState(base ? offsetInput(base.offset) : "10");
  useEffect(() => setBaseOffset(base ? offsetInput(base.offset) : "10"), [base?.offset]); // eslint-disable-line react-hooks/exhaustive-deps
  const baseParsed = parseOffset(baseOffset);
  const baseChanged = base != null && baseParsed !== base.offset;

  // Nouveau revendeur : l'écart part de celui de la base
  const [newName, setNewName] = useState("");
  const [newCity, setNewCity] = useState<string | null>(null);
  const [newOffset, setNewOffset] = useState(base ? offsetInput(base.offset) : "10");
  useEffect(() => setNewOffset(base ? offsetInput(base.offset) : "10"), [base?.offset]); // eslint-disable-line react-hooks/exhaustive-deps
  const newParsed = parseOffset(newOffset);
  const canAdd = newName.trim() !== "" && newParsed !== null && !Number.isNaN(newParsed);

  async function run(body: Record<string, unknown>, ok: string) {
    setBusy(true);
    try {
      onOptions(await send(body));
      onStatus({ kind: "ok", text: ok });
      return true;
    } catch (e) {
      onStatus({ kind: "error", text: e instanceof Error ? e.message : "Échec" });
      return false;
    } finally {
      setBusy(false);
    }
  }

  // ── Ordre : glisser la poignée ⋮⋮ (souris ou doigt), ou flèches du clavier sur la poignée ──
  const [order, setOrder] = useState<string[]>(() => named.map((o) => o.id));
  useEffect(() => setOrder(named.map((o) => o.id)), [named]);
  const [dragId, setDragId] = useState<string | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  // Ligne tenue : suit le doigt / la souris (décalage entre le pointeur et le haut de la ligne au moment de la prise).
  const grab = useRef({ offset: 0, y: 0 });
  const follow = () => {
    const list = listRef.current;
    const el = dragId ? list?.querySelector<HTMLElement>(`[data-rv-id="${dragId}"]`) : null;
    if (!list || !el) return;
    const y = grab.current.y - list.getBoundingClientRect().top - grab.current.offset;
    el.style.transform = `translateY(${Math.round(y - el.offsetTop)}px)`;
  };
  useLayoutEffect(follow, [order, dragId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!dragId) return;
    document.body.classList.add("rv-dragging");
    return () => document.body.classList.remove("rv-dragging");
  }, [dragId]);
  const endDrag = () => {
    listRef.current?.querySelectorAll<HTMLElement>("[data-rv-id]").forEach((el) => (el.style.transform = ""));
    setDragId(null);
  };
  const byId = useMemo(() => new Map(named.map((o) => [o.id, o])), [named]);
  const sameOrder = (a: string[]) => a.length === named.length && a.every((id, i) => named[i]?.id === id);
  const saveOrder = (ids: string[]) => {
    if (!sameOrder(ids)) run({ action: "reorder", ids }, "Ordre des revendeurs enregistré.");
  };
  const moveTo = (y: number) => {
    if (!dragId || !listRef.current) return;
    const rows = [...listRef.current.querySelectorAll<HTMLElement>("[data-rv-id]")].filter((el) => el.dataset.rvId !== dragId);
    const index = rows.filter((el) => {
      const r = el.getBoundingClientRect();
      return r.top + r.height / 2 < y;
    }).length;
    setOrder((cur) => {
      const rest = cur.filter((id) => id !== dragId);
      const next = [...rest.slice(0, index), dragId, ...rest.slice(index)];
      return next.join() === cur.join() ? cur : next;
    });
  };
  const nudge = (id: string, delta: number) => {
    const i = order.indexOf(id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= order.length) return;
    const next = order.slice();
    [next[i], next[j]] = [next[j], next[i]];
    setOrder(next);
    saveOrder(next);
  };

  const searching = filter.trim() !== "";
  const shown = order.map((id) => byId.get(id)).filter((o): o is PriceOption => !!o && matchesOption(o, filter));

  return (
    <div className="opt-manager rv">
      {base && (
        <div className="rv-base">
          <div className="rv-base-main">
            <span className="rv-base-name">
              {base.name} <span className="rv-tag">par défaut</span>
            </span>
            <span className="muted small">
              Tarif affiché à l&apos;ouverture de l&apos;admin. Chaque nouveau revendeur reprend cet écart et les prix
              saisis de ce tarif (Prix des produits).
            </span>
          </div>
          <form
            className="rv-base-offset"
            onSubmit={(e) => {
              e.preventDefault();
              if (baseChanged && baseParsed != null && !Number.isNaN(baseParsed)) {
                run({ action: "update", id: base.id, offset: baseParsed }, `Écart de base : ${formatOffset(baseParsed)}.`);
              }
            }}
          >
            <OffsetField value={baseOffset} onChange={setBaseOffset} label="Écart de base" />
            {baseChanged && (
              <button
                type="submit"
                className="btn btn-gold btn-sm"
                disabled={busy || baseParsed == null || Number.isNaN(baseParsed)}
              >
                Enregistrer
              </button>
            )}
          </form>
        </div>
      )}

      <form
        className="opt-add"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!canAdd || busy) return;
          const name = newName.trim();
          if (await run({ action: "create", name, city: newCity, offset: newParsed }, `« ${name} » ajouté.`)) {
            setNewName("");
            setNewCity(null);
            setNewOffset(base ? offsetInput(base.offset) : "10");
          }
        }}
      >
        <span className="opt-add-title">Nouveau revendeur</span>
        <input
          className="admin-input opt-row-name"
          value={newName}
          maxLength={NAME_MAX}
          placeholder="Nom du revendeur"
          onChange={(e) => setNewName(e.target.value)}
          aria-label="Nom du nouveau revendeur"
        />
        <CityPicker value={newCity} choices={cities} onChange={setNewCity} disabled={busy} />
        <OffsetField value={newOffset} onChange={setNewOffset} label="Écart du nouveau revendeur" />
        <button type="submit" className="btn btn-gold" disabled={!canAdd || busy}>
          Ajouter
        </button>
        <Example offset={newParsed} />
      </form>

      {named.length > 6 && (
        <label className="opt-search opt-manager-search">
          <SearchIcon size={16} />
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Rechercher un nom, une ville…"
            aria-label="Rechercher un revendeur"
          />
        </label>
      )}

      {named.length === 0 ? (
        <p className="muted small rv-empty">Aucun revendeur pour le moment : ajoutez-en un ci-dessus.</p>
      ) : (
        <ul
          className="rv-list"
          ref={listRef}
          onPointerMove={(e) => {
            if (!dragId) return;
            grab.current.y = e.clientY;
            moveTo(e.clientY);
            follow();
          }}
          onPointerUp={() => {
            if (!dragId) return;
            endDrag();
            saveOrder(order);
          }}
          onPointerCancel={() => {
            endDrag();
            setOrder(named.map((o) => o.id));
          }}
        >
          {shown.map((o) =>
            editing === o.id ? (
              <li key={o.id} className="rv-row rv-row-editing" data-rv-id={o.id}>
                <EditRow
                  option={o}
                  cities={cities}
                  busy={busy}
                  onCancel={() => setEditing(null)}
                  onSave={async (name, city, offset) => {
                    const ok = await run(
                      { action: "update", id: o.id, name, city, offset },
                      `« ${name} » enregistré : ${formatOffset(offset)}${city ? `, ${city}` : ""}.`,
                    );
                    if (ok) setEditing(null);
                  }}
                />
              </li>
            ) : (
              <li key={o.id} className="rv-row" data-rv-id={o.id} data-dragging={dragId === o.id}>
                <button
                  type="button"
                  className="rv-grip"
                  aria-label={`Déplacer ${o.name} (flèches haut / bas)`}
                  title={searching ? "Effacez la recherche pour changer l'ordre" : "Glisser pour changer l'ordre"}
                  disabled={searching || busy}
                  onPointerDown={(e) => {
                    if (searching || busy) return;
                    e.preventDefault();
                    const row = e.currentTarget.closest<HTMLElement>("[data-rv-id]");
                    grab.current = { offset: e.clientY - (row?.getBoundingClientRect().top ?? e.clientY), y: e.clientY };
                    listRef.current?.setPointerCapture(e.pointerId);
                    setDragId(o.id);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                      e.preventDefault();
                      nudge(o.id, e.key === "ArrowUp" ? -1 : 1);
                    }
                  }}
                >
                  <GripIcon size={16} />
                </button>
                <button type="button" className="rv-name" onClick={() => setEditing(o.id)} title="Modifier">
                  <strong>{o.name}</strong>
                  {o.city && <span className="muted"> · {o.city}</span>}
                </button>
                <span className="rv-offset">{formatOffset(o.offset)}</span>
                <span className="rv-actions">
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(o.id)} disabled={busy}>
                    <PencilIcon size={14} /> Modifier
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm rv-delete"
                    disabled={busy}
                    onClick={() => {
                      if (window.confirm(`Supprimer « ${o.name} » et ses prix saisis ? (ses factures restent dans l'historique)`)) {
                        run({ action: "delete", id: o.id }, `« ${o.name} » supprimé.`);
                      }
                    }}
                  >
                    <TrashIcon size={14} /> Supprimer
                  </button>
                </span>
              </li>
            ),
          )}
        </ul>
      )}
    </div>
  );
}
