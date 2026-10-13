import { NextResponse } from "next/server";
import { catalogueBrands, fetchPhotos, publicFile } from "@/lib/catalogue-data";
import { CATALOGUE_TITLES, cataloguePdf, type CatalogueMode } from "@/lib/catalogue-pdf";
import { slug } from "@/lib/format";
import { requireAdmin } from "@/lib/guard";
import { isBase, pricesFor } from "@/lib/options";
import { getOptions } from "@/lib/price-options";
import { getPrices } from "@/lib/prices";

// Photos de tous les produits à télécharger : on laisse le temps.
export const maxDuration = 60;

const MODES: CatalogueMode[] = ["public", "revendeur", "validation"];
const MAX_IDS = 5000;

/**
 * Catalogue en PDF (page Gestion › PDF). Corps : `mode` (public | revendeur | validation), `option` (revendeur,
 * type « revendeur »), `ids` (variants choisis ; absent = tout le catalogue).
 */
export async function POST(req: Request) {
  const denied = await requireAdmin(req, { write: false });
  if (denied) return denied;

  const body = (await req.json().catch(() => null)) as { mode?: unknown; option?: unknown; ids?: unknown } | null;
  const mode = MODES.find((m) => m === body?.mode);
  if (!mode) return NextResponse.json({ error: "Type de catalogue inconnu" }, { status: 400 });
  let ids: Set<string> | null = null;
  if (body?.ids != null) {
    if (!Array.isArray(body.ids) || body.ids.length > MAX_IDS || !body.ids.every((id) => typeof id === "string")) {
      return NextResponse.json({ error: "Sélection invalide" }, { status: 400 });
    }
    ids = new Set(body.ids as string[]);
  }

  const { brands, items } = await catalogueBrands({ ids });
  if (!brands.length) return NextResponse.json({ error: "Aucun produit sélectionné" }, { status: 400 });

  let reseller: Parameters<typeof cataloguePdf>[0]["reseller"];
  if (mode === "revendeur") {
    const [options, prices] = await Promise.all([getOptions(), getPrices()]);
    const option = options.find((o) => o.id === body?.option);
    if (!option) return NextResponse.json({ error: "Revendeur inconnu" }, { status: 400 });
    reseller = {
      prices: pricesFor(option, prices, items),
      // Le tarif de base n'a pas de nom propre : rien n'est affiché.
      name: isBase(option) ? null : option.name,
      city: isBase(option) ? null : option.city,
    };
  }

  const urls = brands.flatMap((b) => b.groups.flatMap((g) => g.items.map((it) => it.image).filter((u): u is string => !!u)));
  const [images, logo, logos] = await Promise.all([
    fetchPhotos(urls),
    publicFile("/mecafe-logo.png", req.url),
    Promise.all(brands.map((b) => (b.logoPath ? publicFile(b.logoPath, req.url) : null))),
  ]);

  const date = new Date();
  const pdf = await cataloguePdf({
    mode,
    brands: brands.map(({ logoPath: _p, ...b }, i) => ({ ...b, logo: logos[i] })),
    images,
    logo,
    date,
    reseller,
  });
  const day = date.toISOString().slice(0, 10);
  const who = reseller?.name ? `-${slug(reseller.name)}` : "";
  const base = slug(CATALOGUE_TITLES[mode]); // « catalogue-de-prix »
  const name = `${base.charAt(0).toUpperCase()}${base.slice(1)}${who}-Mecafe-${day}.pdf`;
  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
