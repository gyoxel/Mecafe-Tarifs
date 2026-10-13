"use client";

import { useState } from "react";
import type { PriceOption } from "@/lib/options";
import { OptionsManager } from "./OptionsManager";

/** Gestion › Revendeurs et villes. */
export function CommerciauxPanel({
  options: initial,
  changes,
}: {
  options: PriceOption[];
  /** Nombre de produits où Prix Gros a changé après le prix saisi du revendeur (id → nombre). */
  changes: Record<string, number>;
}) {
  const [options, setOptions] = useState(initial);
  const [status, setStatus] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  return (
    <section className="admin-options">
      <h2 className="admin-section-title">Revendeurs et villes</h2>
      <p className="muted small admin-options-hint">
        Chaque revendeur suit « Prix Gros » (ou le prix du site), produit par produit, sauf là où un prix lui est
        saisi dans « Prix des produits ».
      </p>
      {status && (
        <p className={`notice ${status.kind === "error" ? "warn" : "ok"} gestion-status`} role="status">
          {status.text}
        </p>
      )}
      <OptionsManager options={options} onOptions={setOptions} onStatus={setStatus} changes={changes} />
    </section>
  );
}
