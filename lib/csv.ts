import { fold } from "./format";
import type { CatalogItem, PriceMap } from "./types";
import { effectivePrice, type PriceOption } from "./options";

/**
 * Format Excel français : séparateur ";", virgule décimale, BOM UTF-8.
 * prix_commercial = prix saisi dans l'option (vide = automatique) ; c'est la seule colonne relue à l'import.
 * prix_applique = ce que voit le commercial (saisi, sinon prix site + écart), pour information.
 */
export const CSV_HEADER = ["variant_id", "sku", "marque", "produit", "format", "prix_site", "prix_commercial", "prix_applique"];

const cell = (v: string | number | null | undefined): string => {
  const s = v == null ? "" : String(v);
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const num = (n: number) => String(n).replace(".", ",");

export function buildCsv(items: CatalogItem[], prices: PriceMap, option: PriceOption): string {
  const lines = [CSV_HEADER.join(";")];
  for (const it of items) {
    const commercial = prices[it.id];
    const applied = effectivePrice(option, prices, it);
    lines.push(
      [
        it.id,
        cell(it.sku),
        cell(it.brand),
        cell(it.title),
        cell(it.variant),
        num(it.price),
        commercial == null ? "" : num(commercial),
        applied == null ? "" : num(applied),
      ].join(";"),
    );
  }
  return "﻿" + lines.join("\r\n") + "\r\n";
}

/** Parse un CSV (guillemets, ; ou , comme séparateur). Retourne une liste d'enregistrements clés = en-têtes normalisés. */
export function parseCsv(text: string): Record<string, string>[] {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const delim = (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === delim) {
      row.push(field);
      field = "";
    }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  if (rows.length < 2) return [];

  const headers = rows[0].map((h) => fold(h).replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""));
  return rows.slice(1).map((r) => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? "").trim()])));
}

/** "109", "109,5", "1 090,00 DH" → nombre ; null si vide ; NaN si invalide. */
export function parsePrice(raw: string | undefined): number | null {
  const s = (raw ?? "").replace(/dh|mad/gi, "").replace(/[\s  ]/g, "").replace(",", ".");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 && n <= 1_000_000 ? Math.round(n * 100) / 100 : NaN;
}
