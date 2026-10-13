"use client";

import { useState } from "react";
import type { PriceOption } from "@/lib/options";
import { OptionsManager } from "./OptionsManager";

/** Gestion › Revendeurs et villes. */
export function CommerciauxPanel({ options: initial }: { options: PriceOption[] }) {
  const [options, setOptions] = useState(initial);
  const [status, setStatus] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  return (
    <section className="admin-options">
      <h2 className="admin-section-title">Revendeurs et villes</h2>
      <p className="muted small admin-options-hint">
        Chaque revendeur a son prix pour chaque produit, réglé dans « Prix des produits ». Un nouveau revendeur part
        des prix de « Prix Gros ».
      </p>
      {status && (
        <p className={`notice ${status.kind === "error" ? "warn" : "ok"} gestion-status`} role="status">
          {status.text}
        </p>
      )}
      <OptionsManager options={options} onOptions={setOptions} onStatus={setStatus} />
    </section>
  );
}
