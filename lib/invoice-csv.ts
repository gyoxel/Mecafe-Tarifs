import type { SavedInvoice } from "./invoice-types";

/**
 * Export des factures pour Excel (format français : « ; », virgule décimale, BOM UTF-8).
 * - résumé : une ligne par facture ;
 * - détail : une ligne par produit facturé (pour les tableaux croisés).
 */
const cell = (v: string | number | null | undefined): string => {
  const s = v == null ? "" : String(v);
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const num = (n: number) => n.toFixed(2).replace(".", ",");
const p2 = (n: number) => String(n).padStart(2, "0");
const date = (iso: string) => {
  const d = new Date(iso);
  return `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()}`;
};
const time = (iso: string) => {
  const d = new Date(iso);
  return `${p2(d.getHours())}:${p2(d.getMinutes())}`;
};
const csv = (rows: (string | number | null)[][]) => "﻿" + rows.map((r) => r.map(cell).join(";")).join("\r\n") + "\r\n";

export function invoicesSummaryCsv(list: SavedInvoice[]): string {
  return csv([
    ["N°", "Date", "Heure", "Revendeur", "Ville", "Articles", "Total (DH)", "Statut", "Modifiée le"],
    ...list.map((i) => [
      i.number,
      date(i.createdAt),
      time(i.createdAt),
      i.commercial,
      i.city,
      i.count,
      num(i.total),
      "Confirmée",
      i.updatedAt ? date(i.updatedAt) : "",
    ]),
  ]);
}

export function invoicesDetailCsv(list: SavedInvoice[]): string {
  return csv([
    ["N°", "Date", "Revendeur", "Ville", "Marque", "Produit", "Format", "SKU", "Qté", "Prix unitaire (DH)", "Total ligne (DH)", "Total facture (DH)"],
    ...list.flatMap((i) =>
      i.rows.map((r) => [
        i.number,
        date(i.createdAt),
        i.commercial,
        i.city,
        r.brand,
        r.name,
        r.variant,
        r.sku,
        r.qty,
        num(r.unit),
        num(r.total),
        num(i.total),
      ]),
    ),
  ]);
}

export function downloadText(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
