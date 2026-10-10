import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import { invoiceDate } from "./cart";
import { formatDH } from "./format";
import type { SavedInvoice } from "./invoice-types";

/**
 * Facture en PDF (A4, texte vectoriel), même contenu que la facture imprimée :
 * logo, n°, date, commercial, lignes, total. Plusieurs pages si besoin (en-tête du tableau répété).
 */
const A4 = { w: 595.28, h: 841.89 };
const M = 42; // marges
const INK = rgb(0.07, 0.07, 0.07);
const MUTED = rgb(0.45, 0.45, 0.45);
const LINE = rgb(0.86, 0.86, 0.86);

/** Les polices standard PDF ne couvrent que WinAnsi : on remplace / retire le reste (espaces fines, −…). */
function safe(font: PDFFont, text: string): string {
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
function wrap(font: PDFFont, text: string, size: number, width: number): string[] {
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

export async function invoicePdf(inv: SavedInvoice, logoPng: Uint8Array | null): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Facture ${inv.number}`);
  doc.setAuthor("Mécafé");
  doc.setCreator("Mécafé");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let logo: PDFImage | null = null;
  try {
    logo = logoPng ? await doc.embedPng(logoPng) : null;
  } catch {
    logo = null;
  }

  const T = (s: string, f: PDFFont = font) => safe(f, s);
  const right = (page: PDFPage, s: string, x: number, y: number, size: number, f: PDFFont = font, color = INK) =>
    page.drawText(T(s, f), { x: x - f.widthOfTextAtSize(T(s, f), size), y, size, font: f, color });

  // Colonnes du tableau (x de départ ; les montants sont alignés à droite sur `end`).
  const W = A4.w - 2 * M;
  const col = {
    num: M,
    product: M + 22,
    productW: W * 0.46,
    format: M + 22 + W * 0.46 + 8,
    qtyEnd: M + W * 0.73,
    unitEnd: M + W * 0.87,
    totalEnd: M + W,
  };

  let page = doc.addPage([A4.w, A4.h]);
  let y = A4.h - M;

  // En-tête : logo + bloc facture
  if (logo) {
    const lw = 130;
    const lh = (logo.height / logo.width) * lw;
    page.drawImage(logo, { x: M, y: y - lh, width: lw, height: lh });
  } else {
    page.drawText("Mécafé", { x: M, y: y - 24, size: 24, font: bold, color: rgb(0.66, 0.45, 0.16) });
  }
  right(page, "FACTURE", A4.w - M, y - 20, 22, bold);
  right(page, `N° ${inv.number}`, A4.w - M, y - 40, 11, bold);
  right(page, `Date : ${invoiceDate(new Date(inv.createdAt))}`, A4.w - M, y - 55, 10, font, MUTED);
  if (inv.updatedAt) right(page, `Modifiée le ${invoiceDate(new Date(inv.updatedAt))}`, A4.w - M, y - 68, 9, font, MUTED);
  y -= 84;
  page.drawLine({ start: { x: M, y }, end: { x: A4.w - M, y }, thickness: 1.6, color: INK });
  y -= 24;

  // Commercial
  page.drawText("REVENDEUR", { x: M, y, size: 8, font: bold, color: MUTED });
  y -= 15;
  page.drawText(T(inv.commercial, bold), { x: M, y, size: 12, font: bold, color: INK });
  if (inv.city) {
    y -= 14;
    page.drawText(T(inv.city), { x: M, y, size: 10.5, font, color: INK });
  }
  y -= 28;

  const tableHead = () => {
    const s = 8;
    page.drawText("#", { x: col.num, y, size: s, font: bold, color: MUTED });
    page.drawText("PRODUIT", { x: col.product, y, size: s, font: bold, color: MUTED });
    page.drawText("FORMAT", { x: col.format, y, size: s, font: bold, color: MUTED });
    right(page, "QTÉ", col.qtyEnd, y, s, bold, MUTED);
    right(page, "PRIX UNITAIRE", col.unitEnd, y, s, bold, MUTED);
    right(page, "TOTAL", col.totalEnd, y, s, bold, MUTED);
    y -= 7;
    page.drawLine({ start: { x: M, y }, end: { x: A4.w - M, y }, thickness: 0.9, color: INK });
    y -= 15;
  };
  tableHead();

  const size = 9.5;
  inv.rows.forEach((r, i) => {
    const label = `${r.brand.toUpperCase()}  ${r.name}${r.sku ? ` · ${r.sku}` : ""}`;
    const lines = wrap(font, T(label), size, col.productW);
    const h = lines.length * 12 + 8;
    if (y - h < M + 60) {
      page = doc.addPage([A4.w, A4.h]);
      y = A4.h - M;
      tableHead();
    }
    page.drawText(String(i + 1), { x: col.num, y, size, font, color: MUTED });
    lines.forEach((l, k) => page.drawText(l, { x: col.product, y: y - k * 12, size, font, color: INK }));
    page.drawText(T(r.variant ?? "—"), { x: col.format, y, size, font, color: INK });
    right(page, String(r.qty), col.qtyEnd, y, size);
    right(page, `${formatDH(r.unit)}${r.sitePrice ? "*" : ""}`, col.unitEnd, y, size);
    right(page, formatDH(r.total), col.totalEnd, y, size, bold);
    y -= h - 4;
    page.drawLine({ start: { x: M, y: y + 4 }, end: { x: A4.w - M, y: y + 4 }, thickness: 0.5, color: LINE });
    y -= 7;
  });

  // Total
  if (y < M + 70) {
    page = doc.addPage([A4.w, A4.h]);
    y = A4.h - M;
  }
  y -= 6;
  page.drawText(`${inv.count} article${inv.count > 1 ? "s" : ""}`, { x: M, y, size: 10.5, font: bold, color: INK });
  right(page, formatDH(inv.total), col.totalEnd, y - 1, 15, bold);
  const totalW = bold.widthOfTextAtSize(T(formatDH(inv.total), bold), 15);
  right(page, "TOTAL", col.totalEnd - totalW - 16, y, 10.5, bold);
  if (inv.rows.some((r) => r.sitePrice)) {
    y -= 22;
    page.drawText("* Prix du site (pas de prix revendeur pour ce produit).", { x: M, y, size: 8.5, font, color: MUTED });
  }

  // Pied de page sur chaque page
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    const foot = T(`Mécafé · mecafe.ma${pages.length > 1 ? `   —   ${i + 1}/${pages.length}` : ""}`);
    p.drawText(foot, { x: (A4.w - font.widthOfTextAtSize(foot, 8.5)) / 2, y: M - 14, size: 8.5, font, color: MUTED });
  });

  return doc.save();
}
