"use client";

import { parseOffset } from "@/lib/options";

/** Écart : le « − » est fixe, on ne saisit que le montant. */
export function OffsetField({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const parsed = parseOffset(value);
  return (
    <label className="offset-field" data-invalid={parsed === null || Number.isNaN(parsed)}>
      <span className="offset-sign" aria-hidden="true">
        −
      </span>
      <input
        value={value}
        inputMode="decimal"
        onChange={(e) => onChange(e.target.value.replace(/[^\d.,]/g, ""))}
        aria-label={`${label} (DH en moins sur le prix site)`}
      />
      <span className="offset-unit">DH</span>
    </label>
  );
}
