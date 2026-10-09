"use client";

import { useEffect, useMemo, useState } from "react";
import { cityChoices } from "@/lib/cities";
import { NAME_MAX, parseOffset, type PriceOption } from "@/lib/options";
import { CityPicker } from "./CityPicker";
import { CloseIcon } from "./Icons";
import { OffsetField } from "./OffsetField";
import { OptionList } from "./OptionPicker";

type Props = {
  options: PriceOption[];
  value: string | null;
  onPick: (o: PriceOption) => void;
  /** Liste mise à jour après l'ajout d'un commercial. */
  onOptions: (list: PriceOption[]) => void;
  /** Absent : il faut choisir un commercial pour continuer (pas de fermeture). */
  onClose?: () => void;
};

/** Fenêtre au centre d'une page floutée : choisir le commercial (ou en ajouter un). */
export function CommercialChooser({ options, value, onPick, onOptions, onClose }: Props) {
  const [adding, setAdding] = useState(options.length === 0);
  const [name, setName] = useState("");
  const [city, setCity] = useState<string | null>(null);
  const [offset, setOffset] = useState("10");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const parsed = parseOffset(offset);
  const canAdd = name.trim() !== "" && parsed !== null && !Number.isNaN(parsed);
  const cities = useMemo(() => cityChoices(options.map((o) => o.city)), [options]);

  // Page derrière figée ; Échap ferme si un commercial est déjà choisi.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && onClose && !e.defaultPrevented) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!canAdd || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", name: name.trim(), city, offset: parsed }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; options?: PriceOption[] };
      if (!res.ok || !data.options) throw new Error(data.error ?? `Erreur ${res.status}`);
      onOptions(data.options);
      // Le nouveau commercial est le dernier de la liste : on le choisit directement.
      const created = data.options[data.options.length - 1];
      if (created) onPick(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec de l'ajout");
    }
    setBusy(false);
  }

  return (
    <div className="chooser-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className="chooser" role="dialog" aria-modal="true" aria-labelledby="chooser-title">
        <div className="chooser-head">
          <div>
            <h2 id="chooser-title">Choisir un commercial</h2>
            <p className="muted small">Les prix commerciaux s&apos;afficheront selon son écart.</p>
          </div>
          {onClose && (
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Fermer">
              <CloseIcon size={14} />
            </button>
          )}
        </div>

        {options.length > 0 && (
          <OptionList options={options} value={value} onPick={onPick} label="Commerciaux" autoFocus={!adding} />
        )}

        {adding ? (
          <form className="chooser-add" onSubmit={add}>
            <p className="chooser-add-title">Nouveau commercial</p>
            <input
              className="admin-input"
              value={name}
              maxLength={NAME_MAX}
              placeholder="Nom du commercial"
              onChange={(e) => setName(e.target.value)}
              aria-label="Nom du commercial"
              autoFocus
            />
            <div className="chooser-add-row">
              <CityPicker value={city} choices={cities} onChange={setCity} disabled={busy} />
              <OffsetField value={offset} onChange={setOffset} label="Écart" />
            </div>
            {error && <p className="form-error">{error}</p>}
            <div className="chooser-add-actions">
              {options.length > 0 && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAdding(false)}>
                  Annuler
                </button>
              )}
              <button type="submit" className="btn btn-gold btn-sm" disabled={!canAdd || busy}>
                {busy ? "Ajout…" : "Ajouter et choisir"}
              </button>
            </div>
          </form>
        ) : (
          <button type="button" className="chooser-add-btn" onClick={() => setAdding(true)}>
            + Ajouter un commercial
          </button>
        )}
      </div>
    </div>
  );
}
