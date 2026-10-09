"use client";

import { useState } from "react";
import { NAME_MAX, formatOffset, matchesOption, parseOffset, type PriceOption } from "@/lib/options";
import { CloseIcon, SearchIcon } from "./Icons";

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

const offsetText = (n: number) => String(n).replace(".", ",");

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

/** Une option : nom, écart, par défaut, suppression. Les changements s'enregistrent avec « Enregistrer ». */
function OptionRow({
  option,
  busy,
  canDelete,
  onSave,
  onDefault,
  onDelete,
}: {
  option: PriceOption;
  busy: boolean;
  canDelete: boolean;
  onSave: (name: string, offset: number) => void;
  onDefault: () => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(option.name);
  const [offset, setOffset] = useState(offsetText(option.offset));
  const parsed = parseOffset(offset);
  const changed = name.trim() !== option.name || parsed !== option.offset;
  const valid = name.trim() !== "" && parsed !== null && !Number.isNaN(parsed);

  return (
    <div className="opt-row" data-changed={changed}>
      <input
        className="admin-input opt-row-name"
        value={name}
        maxLength={NAME_MAX}
        onChange={(e) => setName(e.target.value)}
        aria-label="Nom de l'option"
      />
      <label className="opt-row-offset">
        <input
          className="admin-input"
          value={offset}
          inputMode="decimal"
          onChange={(e) => setOffset(e.target.value)}
          aria-label={`Écart de ${option.name} (DH)`}
          aria-invalid={!valid}
        />
        <span>DH</span>
      </label>
      <label className="opt-row-default" title="Option affichée à l'ouverture">
        <input type="radio" name="default-option" checked={option.isDefault} disabled={busy} onChange={onDefault} />
        Par défaut
      </label>
      <span className="opt-row-actions">
        {changed && (
          <>
            <button type="button" className="btn btn-gold btn-sm" disabled={busy || !valid} onClick={() => onSave(name, parsed!)}>
              Enregistrer
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={busy}
              onClick={() => {
                setName(option.name);
                setOffset(offsetText(option.offset));
              }}
            >
              Annuler
            </button>
          </>
        )}
        <button
          type="button"
          className="icon-btn danger"
          disabled={busy || !canDelete}
          onClick={onDelete}
          aria-label={`Supprimer ${option.name}`}
          title={canDelete ? `Supprimer ${option.name}` : "Il faut garder au moins une option"}
        >
          <CloseIcon size={14} />
        </button>
      </span>
    </div>
  );
}

/** Gestion des options : ajout (nom + écart), modification, option par défaut, suppression. */
export function OptionsManager({ options, onOptions, onStatus }: Props) {
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("");
  const [newName, setNewName] = useState("");
  const [newOffset, setNewOffset] = useState("-10");
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

  const shown = options.filter((o) => matchesOption(o, filter));

  return (
    <div className="opt-manager">
      <form
        className="opt-add"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!canAdd || busy) return;
          const name = newName.trim();
          if (await run({ action: "create", name, offset: newParsed }, `Option « ${name} » ajoutée.`)) setNewName("");
        }}
      >
        <span className="opt-add-title">Nouvelle option</span>
        <input
          className="admin-input opt-row-name"
          value={newName}
          maxLength={NAME_MAX}
          placeholder="Nom : D, Youssef…"
          onChange={(e) => setNewName(e.target.value)}
          aria-label="Nom de la nouvelle option"
        />
        <label className="opt-row-offset">
          <input
            className="admin-input"
            value={newOffset}
            inputMode="decimal"
            onChange={(e) => setNewOffset(e.target.value)}
            aria-label="Écart de la nouvelle option (DH)"
            aria-invalid={newParsed === null || Number.isNaN(newParsed)}
          />
          <span>DH</span>
        </label>
        <button type="submit" className="btn btn-gold" disabled={!canAdd || busy}>
          Ajouter
        </button>
        <Example offset={newParsed} />
      </form>

      {options.length > 6 && (
        <label className="opt-search opt-manager-search">
          <SearchIcon size={16} />
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Rechercher une option…"
            aria-label="Rechercher une option"
          />
        </label>
      )}

      <div className="opt-rows">
        <div className="opt-row opt-row-head" aria-hidden="true">
          <span>Nom</span>
          <span>Écart</span>
          <span />
          <span />
        </div>
        {shown.map((o) => (
          <OptionRow
            key={`${o.id}:${o.name}:${o.offset}`}
            option={o}
            busy={busy}
            canDelete={options.length > 1}
            onSave={(name, offset) =>
              run({ action: "update", id: o.id, name: name.trim(), offset }, `Option « ${name.trim()} » : ${formatOffset(offset)}.`)
            }
            onDefault={() => run({ action: "update", id: o.id, isDefault: true }, `« ${o.name} » est l'option par défaut.`)}
            onDelete={() => {
              if (window.confirm(`Supprimer l'option « ${o.name} » et ses prix saisis ?`)) {
                run({ action: "delete", id: o.id }, `Option « ${o.name} » supprimée.`);
              }
            }}
          />
        ))}
      </div>
    </div>
  );
}
