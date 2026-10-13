import "server-only";
import { PDFDocument, StandardFonts, rgb, type Color, type PDFEmbeddedPage, type PDFFont, type PDFPage } from "pdf-lib";
import { invoiceDate } from "./cart";
import { capFirst, formatDH } from "./format";
import { KIND_LABEL, type SavedInvoice } from "./invoice-types";
import { safe, wrap } from "./pdf-text";

/**
 * Devis ou commande en PDF (A4) sur l'en-tête officiel de Mécafé (assets/devis/entete.pdf), reproduit tel quel sur
 * chaque page : logo et raison sociale en haut, coordonnées en bas de la feuille. Le document s'écrit entre les deux :
 * n°, date, client, lignes, total. Plusieurs pages si besoin (en-tête du tableau répété).
 */
const A4 = { w: 595.28, h: 841.89 };
const M = 64; // marges gauche / droite, alignées sur le logo de l'en-tête
const W = A4.w - 2 * M;
const TOP = A4.h - 112; // sous le filet du haut de l'en-tête
const BOTTOM = 104; // au-dessus du filet du bas (coordonnées de la société)

const INK = rgb(0.07, 0.07, 0.07);
const MUTED = rgb(0.42, 0.42, 0.42);
const LINE = rgb(0.86, 0.86, 0.86);
const GOLD = rgb(156 / 255, 141 / 255, 79 / 255); // doré de l'en-tête
const GOLD_SOFT = rgb(0.965, 0.953, 0.918);
const ZEBRA = rgb(0.985, 0.98, 0.968);
const WHITE = rgb(1, 1, 1);

export async function invoicePdf(inv: SavedInvoice, letterhead: Uint8Array | null): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const label = KIND_LABEL[inv.kind]; // « Devis » ou « Commande »
  doc.setTitle(`${label} ${inv.number}`);
  doc.setAuthor("Mécafé");
  doc.setCreator("Mécafé");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let paper: PDFEmbeddedPage | null = null;
  try {
    paper = letterhead ? (await doc.embedPdf(letterhead, [0]))[0] : null;
  } catch {
    paper = null;
  }

  const T = (s: string, f: PDFFont = font) => safe(f, s);
  const text = (page: PDFPage, s: string, x: number, y: number, size: number, f: PDFFont = font, color: Color = INK) =>
    page.drawText(T(s, f), { x, y, size, font: f, color });
  const right = (page: PDFPage, s: string, x: number, y: number, size: number, f: PDFFont = font, color: Color = INK) =>
    page.drawText(T(s, f), { x: x - f.widthOfTextAtSize(T(s, f), size), y, size, font: f, color });

  // Colonnes du tableau (montants alignés à droite sur leur fin).
  const col = {
    num: M + 8,
    product: M + 30,
    productW: W * 0.44,
    format: M + 30 + W * 0.44 + 8,
    qtyEnd: M + W * 0.72,
    unitEnd: M + W * 0.86,
    totalEnd: M + W - 8,
  };

  const pages: PDFPage[] = [];
  let page!: PDFPage;
  let y = TOP;
  const newPage = () => {
    page = doc.addPage([A4.w, A4.h]);
    pages.push(page);
    if (paper) page.drawPage(paper, { x: 0, y: 0, width: A4.w, height: A4.h });
    y = TOP;
  };

  const tableHead = () => {
    const h = 22;
    page.drawRectangle({ x: M, y: y - h, width: W, height: h, color: GOLD });
    const ty = y - 14.5;
    const s = 7.8;
    text(page, "#", col.num, ty, s, bold, WHITE);
    text(page, "PRODUIT", col.product, ty, s, bold, WHITE);
    text(page, "FORMAT", col.format, ty, s, bold, WHITE);
    right(page, "QTÉ", col.qtyEnd, ty, s, bold, WHITE);
    right(page, "PRIX UNITAIRE", col.unitEnd, ty, s, bold, WHITE);
    right(page, "TOTAL", col.totalEnd, ty, s, bold, WHITE);
    y -= h + 4;
  };

  /* ── Première page : titre, n°, date, client ── */
  newPage();
  text(page, label.toUpperCase(), M, y - 26, 26, bold, INK);
  page.drawRectangle({ x: M, y: y - 38, width: 46, height: 3, color: GOLD });
  right(page, `N° ${inv.number}`, M + W, y - 12, 12, bold, GOLD);
  right(page, `Date : ${invoiceDate(new Date(inv.createdAt))}`, M + W, y - 28, 10, font, INK);
  if (inv.updatedAt) right(page, `Modifié le ${invoiceDate(new Date(inv.updatedAt))}`, M + W, y - 41, 8.5, font, MUTED);
  y -= 62;

  // Client : « Client : Nom », puis la ville et le téléphone alignés sous le nom.
  const lines = [
    { s: capFirst(inv.commercial), f: bold, size: 12 },
    ...(inv.city ? [{ s: capFirst(inv.city), f: font, size: 10.5 }] : []),
    ...(inv.phone ? [{ s: `Tél : ${inv.phone}`, f: font, size: 10.5 }] : []),
  ];
  const lineH = 15;
  const boxH = 18 + lines.length * lineH;
  const labelText = "Client :";
  const valueX = M + 14 + bold.widthOfTextAtSize(T(labelText, bold), 12) + 6;
  page.drawRectangle({ x: M, y: y - boxH, width: W * 0.55, height: boxH, color: GOLD_SOFT });
  page.drawRectangle({ x: M, y: y - boxH, width: 3, height: boxH, color: GOLD });
  text(page, labelText, M + 14, y - 22, 12, bold, MUTED);
  lines.forEach((l, i) => text(page, l.s, valueX, y - 22 - i * lineH, l.size, l.f, INK));
  y -= boxH + 22;

  tableHead();

  const size = 9.3;
  inv.rows.forEach((r, i) => {
    const label = `${r.brand.toUpperCase()}  ${r.name}${r.sku ? ` · ${r.sku}` : ""}`;
    const lines = wrap(font, T(label), size, col.productW);
    const h = lines.length * 11.5 + 11;
    if (y - h < BOTTOM) {
      newPage();
      text(page, `${label} N° ${inv.number} (suite)`, M, y - 4, 9, bold, MUTED);
      y -= 18;
      tableHead();
    }
    if (i % 2 === 1) page.drawRectangle({ x: M, y: y - h, width: W, height: h, color: ZEBRA });
    const ty = y - 14;
    text(page, String(i + 1), col.num, ty, size, font, MUTED);
    lines.forEach((l, k) => page.drawText(l, { x: col.product, y: ty - k * 11.5, size, font, color: INK }));
    text(page, r.variant ?? "—", col.format, ty, size, font, INK);
    right(page, String(r.qty), col.qtyEnd, ty, size);
    right(page, `${formatDH(r.unit)}${r.sitePrice ? "*" : ""}`, col.unitEnd, ty, size);
    right(page, formatDH(r.total), col.totalEnd, ty, size, bold);
    y -= h;
    page.drawLine({ start: { x: M, y }, end: { x: M + W, y }, thickness: 0.5, color: LINE });
  });

  /* ── Total ── */
  const note = inv.rows.some((r) => r.sitePrice);
  if (y - (note ? 74 : 56) < BOTTOM) newPage();
  y -= 14;
  const totalText = formatDH(inv.total);
  const boxW = Math.max(200, bold.widthOfTextAtSize(T(totalText, bold), 16) + 125);
  page.drawRectangle({ x: M + W - boxW, y: y - 34, width: boxW, height: 34, color: GOLD });
  // « TOTAL » puis « TTC » en petit, sur la même ligne
  text(page, "TOTAL", M + W - boxW + 14, y - 21.5, 10.5, bold, WHITE);
  text(page, "TTC", M + W - boxW + 14 + bold.widthOfTextAtSize("TOTAL", 10.5) + 4, y - 21.5, 7, font, WHITE);
  right(page, totalText, M + W - 14, y - 22.5, 16, bold, WHITE);
  text(page, `${inv.count} article${inv.count > 1 ? "s" : ""}`, M, y - 21.5, 10.5, bold, INK);
  y -= 34;
  if (note) {
    y -= 18;
    text(page, "* Prix public (pas de prix revendeur pour ce produit).", M, y, 8.5, font, MUTED);
  }

  // N° de page, au-dessus des coordonnées de la société (seulement s'il y a plusieurs pages)
  if (pages.length > 1) {
    pages.forEach((p, i) => right(p, `Page ${i + 1} / ${pages.length}`, M + W, BOTTOM - 22, 8, font, MUTED));
  }

  return doc.save();
}
