import "server-only";
import { PDFDocument, StandardFonts, rgb, type Color, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import { invoiceDate } from "./cart";
import { formatDH } from "./format";
import { safe, wrap } from "./pdf-text";
import { displayTitle, displayVariant } from "./title";
import type { CatalogItem } from "./types";

/**
 * Catalogue en PDF (A4) : page de garde (sommaire ; sauf le catalogue d'un revendeur), puis chaque marque sur une page, deux au plus : selon le
 * nombre de produits, une ou deux colonnes et la hauteur des lignes s'adaptent. Pour chaque produit : photo, nom,
 * format, prix public, et selon le type :
 * - « public » : rien de plus (catalogue de prix, sans mention des revendeurs) ;
 * - « revendeur » (« Catalogue des tarifs ») : le prix d'un revendeur choisi, son nom en « Client » (« — » sans prix) ;
 * - « validation » : une case « Prix revendeur » vide à remplir à la main, mode d'emploi et visa de la direction.
 */

export type CatalogueMode = "public" | "revendeur" | "validation";
export const CATALOGUE_TITLES: Record<CatalogueMode, string> = {
  public: "Catalogue de prix",
  revendeur: "Catalogue des tarifs",
  validation: "Tarifs revendeurs - À valider",
};

export type CatalogueGroup = {
  title: string;
  crumb: string;
  items: CatalogItem[];
};
export type CatalogueBrand = {
  name: string;
  color: string;
  logo: Uint8Array | null;
  groups: CatalogueGroup[];
};
/** Photo d'un produit (PNG ou JPEG), par URL. */
export type ImageBytes = { bytes: Uint8Array; kind: "png" | "jpg" };

const A4 = { w: 595.28, h: 841.89 };
const M = 34;
const W = A4.w - 2 * M;
const GUTTER = 14;

const hex = (h: string): Color => {
  const n = parseInt(h.replace("#", ""), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};
/** Couleur mélangée avec du blanc (t = part de blanc). */
const tint = (h: string, t: number): Color => {
  const n = parseInt(h.replace("#", ""), 16);
  const c = (v: number) => (v + (255 - v) * t) / 255;
  return rgb(c((n >> 16) & 255), c((n >> 8) & 255), c(n & 255));
};

const INK = hex("#121316");
const INK2 = hex("#3a3f4b");
const MUTED = hex("#6b7280");
const FAINT = hex("#9aa1ad");
const LINE = hex("#e3e6eb");
const ZEBRA = hex("#f8f9fb");
const HEAD = hex("#f1f3f6");
const GOLD = "#a8742a";
const PRO = "#0b8a5f";
const VARIANT = "#2563eb";
const PROMO = "#e11d48";
const WHITE = rgb(1, 1, 1);

// Hauteurs verticales des pages produits.
const TABLE_TOP = A4.h - 78; // haut de l'en-tête du tableau
const HEAD_H = 22;
const ROWS_TOP = TABLE_TOP - HEAD_H - 4;
const ROWS_BOTTOM = M + 30; // au-dessus du pied de page
const USABLE = ROWS_TOP - ROWS_BOTTOM;
const CAT_H = 24;
const BRAND_H = 40;
const BRAND_GAP = 12; // espace avant une nouvelle marque (sauf en haut de colonne)

/** Mise en page : colonnes par page et hauteur d'une ligne produit (la même pour tout le document). */
export type Layout = { cols: 1 | 2; rowH: number };

/**
 * Les marques se suivent sans saut de page. Une colonne large si tout tient sur une page, sinon deux colonnes
 * (moins de pages à imprimer).
 */
export function layoutFor(rows: number, groups: number, brands: number): Layout {
  const oneColumn = rows * 48 + groups * CAT_H + brands * (BRAND_H + BRAND_GAP) <= USABLE;
  return oneColumn ? { cols: 1, rowH: 48 } : { cols: 2, rowH: 42 };
}

/** Rectangle à coins arrondis (y = bord du haut). */
function roundRect(
  page: PDFPage,
  x: number,
  yTop: number,
  w: number,
  h: number,
  r: number,
  opts: { color?: Color; borderColor?: Color; borderWidth?: number },
) {
  const rr = Math.min(r, w / 2, h / 2);
  const path =
    `M ${rr} 0 H ${w - rr} Q ${w} 0 ${w} ${rr} V ${h - rr} Q ${w} ${h} ${w - rr} ${h} ` +
    `H ${rr} Q 0 ${h} 0 ${h - rr} V ${rr} Q 0 0 ${rr} 0 Z`;
  page.drawSvgPath(path, {
    x,
    y: yTop,
    ...opts,
    borderWidth: opts.borderColor ? (opts.borderWidth ?? 0.8) : 0,
  });
}

export async function cataloguePdf(input: {
  mode: CatalogueMode;
  brands: CatalogueBrand[];
  images: Map<string, ImageBytes>;
  logo: Uint8Array | null;
  date: Date;
  /** Type « revendeur » : prix du revendeur par variant, et son nom (null = tarif de base, sans nom affiché). */
  reseller?: {
    prices: Record<string, number>;
    name: string | null;
    city: string | null;
  };
}): Promise<Uint8Array> {
  const { mode } = input;
  const title = CATALOGUE_TITLES[mode];
  const hasResale = mode !== "public";
  const resellerLabel = input.reseller?.name
    ? `${input.reseller.name}${input.reseller.city ? ` – ${input.reseller.city}` : ""}`
    : null;
  const doc = await PDFDocument.create();
  const date = invoiceDate(input.date);
  doc.setTitle(`${title} Mécafé — ${date}`);
  doc.setAuthor("Mécafé");
  doc.setCreator("Mécafé");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const T = (s: string, f: PDFFont = font) => safe(f, s);
  const width = (s: string, f: PDFFont, size: number) => f.widthOfTextAtSize(T(s, f), size);
  const text = (page: PDFPage, s: string, x: number, y: number, size: number, f: PDFFont = font, color: Color = INK) =>
    page.drawText(T(s, f), { x, y, size, font: f, color });
  const right = (
    page: PDFPage,
    s: string,
    xEnd: number,
    y: number,
    size: number,
    f: PDFFont = font,
    color: Color = INK,
  ) =>
    page.drawText(T(s, f), {
      x: xEnd - width(s, f, size),
      y,
      size,
      font: f,
      color,
    });
  const center = (
    page: PDFPage,
    s: string,
    cx: number,
    y: number,
    size: number,
    f: PDFFont = font,
    color: Color = INK,
  ) =>
    page.drawText(T(s, f), {
      x: cx - width(s, f, size) / 2,
      y,
      size,
      font: f,
      color,
    });
  /** Coupe un texte à la largeur donnée (avec « … »). */
  const fit = (s: string, f: PDFFont, size: number, w: number) => {
    let t = T(s, f);
    if (f.widthOfTextAtSize(t, size) <= w) return t;
    while (t.length > 1 && f.widthOfTextAtSize(`${t}…`, size) > w) t = t.slice(0, -1);
    return `${t.trimEnd()}…`;
  };
  /** Texte sur `max` lignes au plus (la dernière coupée avec « … »). */
  const lines = (s: string, f: PDFFont, size: number, w: number, max: number) => {
    const all = wrap(f, T(s, f), size, w);
    return all.length <= max
      ? all.map((l) => fit(l, f, size, w))
      : [...all.slice(0, max - 1), fit(all.slice(max - 1).join(" "), f, size, w)];
  };

  const embed = async (img: ImageBytes | Uint8Array | null | undefined): Promise<PDFImage | null> => {
    if (!img) return null;
    const { bytes, kind } = img instanceof Uint8Array ? { bytes: img, kind: "png" as const } : img;
    try {
      return kind === "png" ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
    } catch {
      return null;
    }
  };
  /** Image centrée dans un cadre, sans déformation. */
  const contain = (page: PDFPage, img: PDFImage, x: number, y: number, w: number, h: number) => {
    const s = Math.min(w / img.width, h / img.height);
    page.drawImage(img, {
      x: x + (w - img.width * s) / 2,
      y: y + (h - img.height * s) / 2,
      width: img.width * s,
      height: img.height * s,
    });
  };
  /** Logo rond de la marque, ou initiale sur un disque à sa couleur. */
  const brandMark = (page: PDFPage, b: CatalogueBrand, x: number, yBottom: number, size: number) => {
    const img = brandLogos.get(b.name);
    if (img) return contain(page, img, x, yBottom, size, size);
    page.drawCircle({
      x: x + size / 2,
      y: yBottom + size / 2,
      size: size / 2,
      color: hex(b.color),
    });
    center(page, b.name.charAt(0), x + size / 2, yBottom + size / 2 - size * 0.17, size * 0.45, bold, WHITE);
  };

  const logo = await embed(input.logo);
  const brandLogos = new Map<string, PDFImage | null>();
  for (const b of input.brands) brandLogos.set(b.name, await embed(b.logo));
  const photos = new Map<string, PDFImage | null>();
  for (const [url, img] of input.images) photos.set(url, await embed(img));

  const countOf = (b: CatalogueBrand) => b.groups.reduce((n, g) => n + g.items.length, 0);
  const total = input.brands.reduce((n, b) => n + countOf(b), 0);

  // Page de garde (titre, sommaire) : pas pour le catalogue d'un revendeur, qui commence par les produits.
  const withCover = mode !== "revendeur";
  const coverPage = withCover ? doc.addPage([A4.w, A4.h]) : null;
  const pages: PDFPage[] = coverPage ? [coverPage] : [];
  /** Première et dernière page de chaque marque (pour le sommaire). */
  const spans: { first: number; last: number }[] = [];

  /* ─────────────── Pages produits : les marques se suivent ─────────────── */
  const groupCount = input.brands.reduce((n, b) => n + b.groups.length, 0);
  const { cols, rowH: h } = layoutFor(total, groupCount, input.brands.length);
  const colW = cols === 1 ? W : (W - GUTTER) / 2;
  // Colonnes d'une ligne produit (x relatifs au bord droit de la colonne)
  const boxW = !hasResale ? 0 : cols === 1 ? 104 : 66;
  const siteW = cols === 1 ? 76 : 50;
  const formatW = cols === 1 ? 84 : 0;
  const imgS = Math.min(cols === 1 ? 40 : 34, h - 8);
  const nameSize = cols === 1 ? 9.6 : 7.9;
  const headSize = cols === 1 ? 7.8 : 6.8;
  const tag = mode === "revendeur" ? (resellerLabel ?? "") : ""; // le titre suffit pour les autres types

  let page!: PDFPage;
  let col = 0;
  let y = ROWS_TOP;
  // Haut du tableau sur la page en cours (plus bas sous le titre de la première page, catalogue d'un revendeur)
  let tableTop = TABLE_TOP;
  let rowsTop = ROWS_TOP;
  let zebra = 0;
  const colX = () => M + col * (colW + GUTTER);
  /** Fin (bord droit) de la colonne « Prix public » ; la colonne revendeur, s'il y en a une, suit. */
  const siteEnd = (x: number) => (hasResale ? x + colW - boxW - (cols === 1 ? 14 : 8) : x + colW - 12);

  const tableHead = () => {
    const x = colX();
    const xResale = x + colW - boxW;
    const xSiteEnd = siteEnd(x);
    const hy = tableTop - 14.5;
    roundRect(page, x, tableTop, colW, HEAD_H, 6, { color: HEAD });
    text(page, "PRODUIT", x + 10, hy, headSize, bold, INK2);
    if (formatW) text(page, "FORMAT", xSiteEnd - siteW - formatW, hy, headSize, bold, INK2);
    right(page, "PRIX PUBLIC", xSiteEnd, hy, headSize, bold, INK2);
    if (hasResale) {
      roundRect(page, xResale, tableTop, boxW, HEAD_H, 6, { color: hex(PRO) });
      center(page, "PRIX REVENDEUR", xResale + boxW / 2, hy, headSize, bold, WHITE);
    }
  };

  /**
   * Titre en haut de la première page quand il n'y a pas de page de garde (catalogue d'un revendeur) :
   * logo, titre, nom du revendeur, date et nombre de produits ; les produits commencent juste dessous.
   */
  const firstPageTitle = () => {
    page.drawRectangle({ x: 0, y: A4.h - 8, width: A4.w, height: 8, color: hex(GOLD) });
    let ty = A4.h - 34;
    if (logo) {
      const lw = 120;
      const lh = (logo.height / logo.width) * lw;
      page.drawImage(logo, { x: (A4.w - lw) / 2, y: ty - lh, width: lw, height: lh });
      ty -= lh + 26;
    }
    const big = title.toUpperCase();
    center(page, big, A4.w / 2, ty, Math.min(20, (W - 20) / (width(big, bold, 1) || 1)), bold, INK);
    ty -= 20;
    if (resellerLabel) {
      center(page, `Client : ${resellerLabel}`, A4.w / 2, ty, 12, bold, hex(PRO));
      ty -= 18;
    }
    const pill = `Tarifs au ${date}  ·  ${total} produits  ·  ${input.brands.length} marque${input.brands.length > 1 ? "s" : ""}`;
    const pw = width(pill, bold, 8.5) + 24;
    roundRect(page, (A4.w - pw) / 2, ty, pw, 20, 10, { color: tint(GOLD, 0.88) });
    center(page, pill, A4.w / 2, ty - 13.5, 8.5, bold, hex(GOLD));
    return ty - 34;
  };

  const newPage = () => {
    const first = pages.length === 0; // pas de page de garde : cette page porte le titre
    page = doc.addPage([A4.w, A4.h]);
    pages.push(page);
    if (first) {
      tableTop = firstPageTitle();
      rowsTop = tableTop - HEAD_H - 4;
      col = 0;
      y = rowsTop;
      tableHead();
      return;
    }
    tableTop = TABLE_TOP;
    rowsTop = ROWS_TOP;
    page.drawRectangle({ x: 0, y: A4.h - 6, width: A4.w, height: 6, color: hex(GOLD) });
    const top = A4.h - 20;
    if (logo) {
      const lw = 74;
      const lh = (logo.height / logo.width) * lw;
      page.drawImage(logo, { x: M, y: top - lh, width: lw, height: lh });
    }
    right(page, title, A4.w - M, top - 12, 11, bold, INK);
    if (tag)
      right(page, fit(tag, bold, 8.5, 260), A4.w - M, top - 26, 8.5, bold, mode === "revendeur" ? hex(PRO) : MUTED);
    col = 0;
    y = rowsTop;
    tableHead();
  };
  /** Colonne suivante (ou page suivante). */
  const nextColumn = () => {
    if (col + 1 < cols) {
      col += 1;
      y = rowsTop;
      tableHead();
    } else newPage();
  };

  /** Titre de marque dans la colonne : logo, nom à sa couleur, nombre de produits. */
  const brandHead = (b: CatalogueBrand, cont: boolean) => {
    if (y < rowsTop) y -= BRAND_GAP;
    const x = colX();
    const color = hex(b.color);
    const mid = y - BRAND_H / 2 + 2;
    brandMark(page, b, x + 2, mid - 12, 24);
    text(page, b.name, x + 34, mid - 5, 14, bold, color);
    if (cont) text(page, "(suite)", x + 34 + width(b.name, bold, 14) + 6, mid - 4.5, 8.5, font, MUTED);
    const count = countOf(b);
    right(page, `${count} produit${count > 1 ? "s" : ""}`, x + colW - 4, mid - 4, 8.5, bold, MUTED);
    page.drawLine({
      start: { x, y: y - BRAND_H + 3 },
      end: { x: x + colW, y: y - BRAND_H + 3 },
      thickness: 1.4,
      color,
    });
    y -= BRAND_H;
  };

  const catHead = (b: CatalogueBrand, g: CatalogueGroup, cont: boolean) => {
    const x = colX();
    const color = hex(b.color);
    const label = (g.crumb ? `${g.crumb}  ›  ${g.title}` : g.title).toUpperCase() + (cont ? "  (SUITE)" : "");
    const size = cols === 1 ? 8.6 : 7.6;
    const ty = y - 16;
    page.drawRectangle({ x, y: ty - 3, width: 3, height: size + 4.5, color });
    text(page, fit(label, bold, size, colW - 14), x + 9, ty, size, bold, color);
    y -= CAT_H;
    zebra = 0;
  };

  const row = (b: CatalogueBrand, it: CatalogItem) => {
    const x = colX();
    const top = y;
    const bottom = y - h;
    const mid = (top + bottom) / 2;
    const xResale = x + colW - boxW;
    const xSiteEnd = siteEnd(x);
    if (zebra++ % 2 === 1) page.drawRectangle({ x, y: bottom, width: colW, height: h, color: ZEBRA });

    // photo
    const ix = x + (cols === 1 ? 6 : 4);
    const iy = mid - imgS / 2;
    roundRect(page, ix, iy + imgS, imgS, imgS, 5, { color: WHITE, borderColor: LINE, borderWidth: 0.6 });
    const photo = it.image ? photos.get(it.image) : null;
    if (photo) contain(page, photo, ix + 2, iy + 2, imgS - 4, imgS - 4);
    else center(page, b.name.charAt(0), ix + imgS / 2, mid - imgS * 0.16, imgS * 0.42, bold, LINE);

    // nom, puis (deux colonnes) le format en dessous ; référence si la place le permet
    const nx = ix + imgS + (cols === 1 ? 10 : 7);
    const nameEnd = cols === 1 ? xSiteEnd - siteW - formatW - 10 : xSiteEnd - siteW - 4;
    const nw = nameEnd - nx;
    const variant = it.variant ? displayVariant(it.variant) : null;
    const lh = nameSize + 1.8;
    const extra = cols === 2 && variant ? 11 : 0;
    const maxLines = Math.max(1, Math.min(3, Math.floor((h - 5 - extra) / lh)));
    const nameLines = lines(displayTitle(it.title, it.brand), bold, nameSize, nw, maxLines);
    const showSku = Boolean(it.sku) && cols === 1 && nameLines.length < 3;
    const blockH = nameLines.length * lh + extra + (showSku ? 10 : 0);
    let ty = mid + blockH / 2 - nameSize + 1.5;
    for (const l of nameLines) {
      page.drawText(l, { x: nx, y: ty, size: nameSize, font: bold, color: INK });
      ty -= lh;
    }
    if (showSku) text(page, fit(`Réf. ${it.sku}`, font, 7.2, nw), nx, ty + 1, 7.2, font, FAINT);

    // format (pastille bleue)
    const pill = (px: number, py: number, size: number, maxW: number) => {
      const v = fit(variant!, bold, size, maxW - 10);
      const vw = bold.widthOfTextAtSize(v, size) + 10;
      roundRect(page, px, py + size + 3.2, vw, size + 6.5, (size + 6.5) / 2, { color: tint(VARIANT, 0.9) });
      page.drawText(v, { x: px + 5, y: py, size, font: bold, color: hex(VARIANT) });
    };
    if (cols === 1) {
      if (variant) pill(xSiteEnd - siteW - formatW, mid - 2.8, 7.8, formatW);
      else text(page, "—", xSiteEnd - siteW - formatW + 4, mid - 3, 9, font, FAINT);
    } else if (variant) {
      pill(nx, ty - 1, 6.4, nw); // sous la dernière ligne du nom, sans la toucher
    }

    // prix public (+ ancien prix barré si promotion)
    const ps = cols === 1 ? 11 : 9;
    if (it.compareAt) {
      const old = formatDH(it.compareAt);
      const os = cols === 1 ? 7.5 : 6.5;
      right(page, old, xSiteEnd, mid + 4.5, os, font, FAINT);
      const ow = width(old, font, os);
      page.drawLine({
        start: { x: xSiteEnd - ow, y: mid + 4.5 + os * 0.32 },
        end: { x: xSiteEnd, y: mid + 4.5 + os * 0.32 },
        thickness: 0.6,
        color: FAINT,
      });
      right(page, formatDH(it.price), xSiteEnd, mid - ps + 1, ps, bold, hex(PROMO));
    } else {
      right(page, formatDH(it.price), xSiteEnd, mid - ps / 2 + 2, ps, bold, INK);
    }

    const bh = Math.min(cols === 1 ? 28 : 24, h - 8);
    if (mode === "validation") {
      // case prix revendeur vide, à remplir à la main
      roundRect(page, xResale + 4, mid + bh / 2, boxW - 8, bh, 6, {
        color: WHITE,
        borderColor: tint(PRO, 0.45),
        borderWidth: 0.9,
      });
      right(page, "DH", xResale + boxW - 11, mid - 2.8, cols === 1 ? 8 : 7, bold, tint(PRO, 0.35));
    } else if (mode === "revendeur") {
      const price = input.reseller?.prices[it.id];
      const cx = xResale + boxW / 2;
      if (price == null) center(page, "—", cx, mid - 3, 10, bold, FAINT);
      else {
        const rs = cols === 1 ? 11 : 9;
        roundRect(page, xResale + 4, mid + bh / 2, boxW - 8, bh, 6, { color: hex("#e8f6ef") });
        center(page, formatDH(price), cx, mid - rs / 2 + 2, rs, bold, hex("#075e41"));
      }
    }

    page.drawLine({ start: { x, y: bottom }, end: { x: x + colW, y: bottom }, thickness: 0.4, color: LINE });
    y = bottom;
  };

  newPage();
  for (const b of input.brands) {
    // une marque ne commence pas en bas de colonne : son titre, une catégorie et au moins un produit
    if (y - BRAND_GAP - BRAND_H - CAT_H - h < ROWS_BOTTOM) nextColumn();
    brandHead(b, false);
    const first = pages.length;
    b.groups.forEach((g, gi) => {
      if (gi > 0 && y - CAT_H - h < ROWS_BOTTOM) {
        nextColumn();
        brandHead(b, true);
      }
      catHead(b, g, false);
      for (const it of g.items) {
        if (y - h < ROWS_BOTTOM) {
          nextColumn();
          brandHead(b, true);
          catHead(b, g, true);
        }
        row(b, it);
      }
    });
    spans.push({ first, last: pages.length });
  }

  /* ─────────────── Page de garde (dessinée en dernier : le sommaire connaît les pages) ─────────────── */
  if (coverPage) {
    const cover = coverPage;
    cover.drawRectangle({
      x: 0,
      y: A4.h - 10,
      width: A4.w,
      height: 10,
      color: hex(GOLD),
    });
    let y = A4.h - 70;
    if (logo) {
      const lw = 170;
      const lh = (logo.height / logo.width) * lw;
      cover.drawImage(logo, {
        x: (A4.w - lw) / 2,
        y: y - lh,
        width: lw,
        height: lh,
      });
      y -= lh + 34;
    } else {
      center(cover, "Mécafé", A4.w / 2, y - 30, 34, bold, hex(GOLD));
      y -= 70;
    }
    const big = title.toUpperCase();
    const bigSize = Math.min(26, (W - 20) / (width(big, bold, 1) || 1));
    center(cover, big, A4.w / 2, y, bigSize, bold, INK);
    y -= 22;
    const subtitle =
      mode === "validation"
        ? "Proposition de prix revendeur — à valider par la direction"
        : mode === "revendeur" && resellerLabel
          ? `Client : ${resellerLabel}`
          : null;
    if (subtitle) {
      center(
        cover,
        subtitle,
        A4.w / 2,
        y,
        mode === "revendeur" ? 13 : 11.5,
        mode === "revendeur" ? bold : font,
        mode === "revendeur" ? hex(PRO) : MUTED,
      );
      y -= 22;
    } else y -= 4;
    const pillText = `${mode === "public" ? "Prix" : "Prix public"} au ${date}  ·  ${total} produits  ·  ${input.brands.length} marque${input.brands.length > 1 ? "s" : ""}`;
    const pw = width(pillText, bold, 9.5) + 28;
    roundRect(cover, (A4.w - pw) / 2, y, pw, 24, 12, { color: tint(GOLD, 0.88) });
    center(cover, pillText, A4.w / 2, y - 15.5, 9.5, bold, hex(GOLD));
    y -= 58;

    // Sommaire
    const tx0 = M + 30;
    const tx1 = A4.w - M - 30;
    text(cover, "SOMMAIRE", tx0, y, 9, bold, MUTED);
    y -= 10;
    cover.drawLine({
      start: { x: tx0, y },
      end: { x: tx1, y },
      thickness: 0.8,
      color: LINE,
    });
    const tocBottom = mode === "validation" ? M + 300 : M + 60;
    const tocH = Math.min(46, Math.max(24, (y - tocBottom) / Math.max(1, input.brands.length)));
    input.brands.forEach((b, i) => {
      const count = countOf(b);
      const top = y - i * tocH;
      const mid = top - tocH / 2;
      const ls = Math.min(30, tocH - 12);
      brandMark(cover, b, tx0, mid - ls / 2, ls);
      const nx = tx0 + ls + 12;
      text(cover, b.name, nx, mid - 4.5, 13, bold, hex(b.color));
      const info = `${count} produit${count > 1 ? "s" : ""}`;
      const ix = nx + width(b.name, bold, 13) + 10;
      text(cover, info, ix, mid - 4, 9.5, font, MUTED);
      const { first, last } = spans[i];
      const pageLabel = last > first ? `p. ${first}–${last}` : `p. ${first}`;
      right(cover, pageLabel, tx1, mid - 4, 10.5, bold, INK2);
      const dotsFrom = ix + width(info, font, 9.5) + 10;
      const dotsTo = tx1 - width(pageLabel, bold, 10.5) - 10;
      for (let x = dotsFrom; x < dotsTo; x += 5) cover.drawCircle({ x, y: mid - 1.5, size: 0.6, color: FAINT });
      cover.drawLine({
        start: { x: tx0, y: top - tocH },
        end: { x: tx1, y: top - tocH },
        thickness: 0.5,
        color: LINE,
      });
    });

    // Mode d'emploi + visa de la direction (catalogue « à valider » seulement)
    if (mode === "validation") {
      const boxTop = M + 196;
      roundRect(cover, M, boxTop, W, 70, 10, { color: hex("#f6f7f9") });
      text(cover, "Mode d'emploi", M + 16, boxTop - 22, 10.5, bold, INK);
      text(cover, "Prix public : prix de vente public à la date indiquée.", M + 16, boxTop - 39, 9.5, font, INK2);
      text(
        cover,
        "Prix revendeur : à compléter à la main pour chaque produit, puis à faire valider ci-dessous.",
        M + 16,
        boxTop - 54,
        9.5,
        font,
        INK2,
      );
      const visaTop = boxTop - 88;
      text(cover, "VALIDATION", M, visaTop, 9, bold, MUTED);
      const fw = (W - 2 * 12) / 3;
      ["Proposé par", "Validé par (direction)", "Date et signature"].forEach((label, i) => {
        const x = M + i * (fw + 12);
        roundRect(cover, x, visaTop - 10, fw, 84, 8, {
          borderColor: hex("#c9ced6"),
          color: WHITE,
        });
        text(cover, label, x + 10, visaTop - 26, 8.5, bold, MUTED);
      });
    }
  }

  // Pied de page : date, visa, numéro de page
  const pageCount = pages.length;
  pages.forEach((page, i) => {
    const fy = M - 6;
    page.drawLine({
      start: { x: M, y: fy + 14 },
      end: { x: A4.w - M, y: fy + 14 },
      thickness: 0.6,
      color: LINE,
    });
    text(
      page,
      `Mécafé  ·  ${title}  ·  ${mode === "public" ? "prix" : mode === "revendeur" ? "tarifs" : "prix public"} au ${date}`,
      M,
      fy,
      7.8,
      font,
      MUTED,
    );
    if (page !== coverPage && mode === "validation") {
      const visa = "Visa direction :";
      const vx = A4.w / 2 + 40;
      text(page, visa, vx, fy, 7.8, bold, MUTED);
      const vEnd = vx + width(visa, bold, 7.8) + 6;
      page.drawLine({
        start: { x: vEnd, y: fy - 1 },
        end: { x: vEnd + 70, y: fy - 1 },
        thickness: 0.6,
        color: FAINT,
      });
    }
    right(page, `${i + 1} / ${pageCount}`, A4.w - M, fy, 8, bold, INK2);
  });

  return doc.save();
}
