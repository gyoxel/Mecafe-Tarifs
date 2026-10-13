import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { getCatalog } from "@/lib/catalog";
import { fetchPhotos } from "@/lib/catalogue-data";
import type { CatalogItem } from "@/lib/types";

/**
 * Image d'aperçu du lien (WhatsApp, Messenger…) : logo Mécafé, « Tarifs » et des photos de produits du site
 * (une par marque). Aucune donnée de prix. Accessible sans code (cf. proxy.ts) : les applications de messagerie
 * la téléchargent sans session.
 */
export const alt = "Tarifs Mécafé";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const GOLD = "#a8742a";
const dataUrl = (bytes: Uint8Array, kind: "png" | "jpg") =>
  `data:image/${kind === "png" ? "png" : "jpeg"};base64,${Buffer.from(bytes).toString("base64")}`;

/** Une photo par marque (ordre du site), complétée par les plus grandes marques jusqu'à 6. */
function pickProducts(items: CatalogItem[]): CatalogItem[] {
  const withImage = items.filter((it) => it.image);
  const picked: CatalogItem[] = [];
  const seen = new Set<string>();
  for (const it of withImage) {
    if (!seen.has(it.brand) && !picked.some((p) => p.productId === it.productId)) {
      seen.add(it.brand);
      picked.push(it);
    }
  }
  for (const it of withImage) {
    if (picked.length >= 6) break;
    if (!picked.some((p) => p.productId === it.productId)) picked.push(it);
  }
  return picked.slice(0, 6);
}

async function productPhotos(): Promise<string[]> {
  try {
    const { items } = await getCatalog();
    const products = pickProducts(items);
    const photos = await fetchPhotos(
      products.map((p) => p.image!),
      360,
      6,
    );
    return products.flatMap((p) => {
      const img = photos.get(p.image!);
      return img ? [dataUrl(img.bytes, img.kind)] : [];
    });
  } catch {
    return [];
  }
}

export default async function OpengraphImage() {
  const [photos, logo, bold, semi, ...brandLogos] = await Promise.all([
    productPhotos(),
    // Chemins écrits en entier : seuls ces fichiers sont embarqués avec la fonction.
    readFile(join(process.cwd(), "public/mecafe-logo.png")),
    readFile(join(process.cwd(), "assets/og/manrope-latin-800-normal.woff")),
    readFile(join(process.cwd(), "assets/og/manrope-latin-600-normal.woff")),
    readFile(join(process.cwd(), "public/brands/mecafe.png")),
    readFile(join(process.cwd(), "public/brands/kimbo.png")),
    readFile(join(process.cwd(), "public/brands/caffitaly.png")),
    readFile(join(process.cwd(), "public/brands/odk.png")),
    readFile(join(process.cwd(), "public/brands/foodness.png")),
    readFile(join(process.cwd(), "public/brands/flair.png")),
  ]);
  // Sans photos (Shopify injoignable) : les logos des marques.
  const tiles = photos.length >= 3 ? photos : brandLogos.map((b) => dataUrl(b, "png"));

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: "#faf7f2",
          fontFamily: "Manrope",
          position: "relative",
        }}
      >
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 14, background: GOLD }} />
        <div
          style={{
            width: 520,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: "40px 0 40px 72px",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={dataUrl(logo, "png")} width={300} height={97} alt="" />
          <div style={{ display: "flex", marginTop: 36, fontSize: 124, fontWeight: 800, color: "#121316", lineHeight: 1 }}>
            Tarifs
          </div>
          <div style={{ display: "flex", width: 120, height: 8, borderRadius: 4, background: GOLD, margin: "28px 0 24px" }} />
          <div style={{ display: "flex", fontSize: 36, fontWeight: 600, color: "#3a3f4b" }}>Prix publics</div>
          <div style={{ display: "flex", fontSize: 26, fontWeight: 600, color: "#6b7280", marginTop: 8 }}>
            Cafés · Capsules · Machines · Sirops
          </div>
          <div style={{ display: "flex", fontSize: 28, fontWeight: 800, color: GOLD, marginTop: 40 }}>
            tarifs.mecafe.ma
          </div>
        </div>
        <div
          style={{
            flex: 1,
            display: "flex",
            flexWrap: "wrap",
            alignContent: "center",
            justifyContent: "center",
            gap: 22,
            padding: "40px 56px 40px 8px",
          }}
        >
          {tiles.slice(0, 6).map((src, i) => (
            <div
              key={i}
              style={{
                width: 190,
                height: 190,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 28,
                background: "#ffffff",
                border: "1px solid #ece6dc",
                boxShadow: "0 10px 30px rgba(14, 15, 18, 0.08)",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} width={150} height={150} style={{ objectFit: "contain" }} alt="" />
            </div>
          ))}
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Manrope", data: bold, weight: 800, style: "normal" },
        { name: "Manrope", data: semi, weight: 600, style: "normal" },
      ],
    },
  );
}
