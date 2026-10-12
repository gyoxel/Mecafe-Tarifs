import type { PDFFont } from "pdf-lib";

/** Les polices standard PDF ne couvrent que WinAnsi : on remplace / retire le reste (espaces fines, −…). */
export function safe(font: PDFFont, text: string): string {
  const mapped = text.replace(/[   ]/g, " ").replace(/−/g, "-");
  let out = "";
  for (const ch of mapped) {
    try {
      font.encodeText(ch);
      out += ch;
    } catch {
      out += "";
    }
  }
  return out;
}

/** Découpe un texte en lignes tenant dans `width`. */
export function wrap(font: PDFFont, text: string, size: number, width: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (font.widthOfTextAtSize(next, size) <= width || !cur) cur = next;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [""];
}
