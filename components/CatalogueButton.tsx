"use client";

import { useState } from "react";
import { DownloadIcon } from "./Icons";

/**
 * Télécharge le catalogue revendeurs en PDF (A4 : photos, prix du site, case « Prix revendeur » vide).
 * La préparation prend quelques secondes (photos de tous les produits) : le bouton l'indique.
 */
export function CatalogueButton({ className }: { className?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const download = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/catalogue");
      if (!res.ok) throw new Error(`Erreur ${res.status}`);
      const name =
        /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? "Catalogue-revendeurs-Mecafe.pdf";
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch {
      setError("Le catalogue n'a pas pu être préparé. Réessayez.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button type="button" className={className} onClick={download} disabled={busy} aria-busy={busy}>
        {busy ? <span className="spinner" aria-hidden="true" /> : <DownloadIcon size={16} />}
        {busy ? "Préparation…" : "Catalogue PDF"}
      </button>
      {error && (
        <p className="admin-links-error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
