import { catalogueBrands, fetchPhotos, publicFile } from "@/lib/catalogue-data";
import { cataloguePdf } from "@/lib/catalogue-pdf";
import { slug } from "@/lib/format";
import { requireAdmin } from "@/lib/guard";

// Photos de tous les produits à télécharger : on laisse le temps.
export const maxDuration = 60;

/**
 * Catalogue revendeurs en PDF (A4) : photo, nom, format, prix du site et case « Prix revendeur » vide.
 * `?marque=Kimbo` pour une seule marque.
 */
export async function GET(req: Request) {
  const denied = await requireAdmin(req, { write: false });
  if (denied) return denied;

  const only = new URL(req.url).searchParams.get("marque");
  const { brands } = await catalogueBrands(only);
  if (!brands.length) return new Response("Aucun produit", { status: 404 });

  const urls = brands.flatMap((b) => b.groups.flatMap((g) => g.items.map((it) => it.image).filter((u): u is string => !!u)));
  const [images, logo, logos] = await Promise.all([
    fetchPhotos(urls),
    publicFile("/mecafe-logo.png", req.url),
    Promise.all(brands.map((b) => (b.logoPath ? publicFile(b.logoPath, req.url) : null))),
  ]);

  const date = new Date();
  const pdf = await cataloguePdf({
    brands: brands.map(({ logoPath: _p, ...b }, i) => ({ ...b, logo: logos[i] })),
    images,
    logo,
    date,
  });
  const day = date.toISOString().slice(0, 10);
  const name = `Catalogue-revendeurs-Mecafe${only ? `-${slug(brands[0].name)}` : ""}-${day}.pdf`;
  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
