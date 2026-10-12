import "server-only";
import { brandStyle } from "./brands";
import { getCatalog } from "./catalog";
import type { CatalogueBrand, CatalogueGroup, ImageBytes } from "./catalogue-pdf";
import { fold } from "./format";
import { groupItems, menuLeaves } from "./groups";
import { sizedImage } from "./image";
import type { CatalogItem } from "./types";

/**
 * Marques du catalogue (ordre du site), chacune avec ses produits rangés par catégorie du menu.
 * `ids` : seulement ces variants (sélection de la page PDF) ; `onlyBrand` : une seule marque.
 */
export async function catalogueBrands(filter: { onlyBrand?: string | null; ids?: Set<string> | null } = {}): Promise<{
  brands: (Omit<CatalogueBrand, "logo"> & { logoPath: string | null })[];
  items: CatalogItem[];
}> {
  const { items, menu, order } = await getCatalog();
  const leaves = menuLeaves(menu);
  const sorted = groupItems(items, items, leaves, order);

  const { onlyBrand, ids } = filter;
  const names = [...new Set(items.map((it) => it.brand))].filter((b) => !onlyBrand || fold(b) === fold(onlyBrand));
  const brands = names.map((name) => {
    const groups: CatalogueGroup[] = [];
    let lastK = -1;
    for (const { it, k } of sorted) {
      if (it.brand !== name || (ids && !ids.has(it.id))) continue;
      if (k !== lastK) {
        const leaf = leaves[k];
        groups.push({
          title: leaf?.node.title ?? "Autres",
          crumb: leaf ? leaf.crumbs.map((c) => c.title).join(" › ") : "",
          items: [],
        });
        lastK = k;
      }
      groups[groups.length - 1].items.push(it);
    }
    const style = brandStyle(name);
    return { name, color: style.color, logoPath: style.logo ?? null, groups };
  });
  return { brands: brands.filter((b) => b.groups.length), items };
}

/** Reconnaît une image PNG ou JPEG (les seules que le PDF accepte) à ses premiers octets. */
function kindOf(bytes: Uint8Array): ImageBytes["kind"] | null {
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "jpg";
  return null;
}

async function getBytes(url: string, accept: string): Promise<Uint8Array | null> {
  try {
    const res = await fetch(url, { headers: { Accept: accept }, signal: AbortSignal.timeout(10_000), cache: "no-store" });
    return res.ok ? new Uint8Array(await res.arrayBuffer()) : null;
  } catch {
    return null;
  }
}

/**
 * Photos des produits en petit format (CDN Shopify), en PNG ou JPEG : on ne demande pas le WebP,
 * et si le CDN en renvoie quand même, on redemande en JPEG. Une photo introuvable laisse une case vide.
 */
export async function fetchPhotos(urls: string[], width = 220, concurrency = 12): Promise<Map<string, ImageBytes>> {
  const out = new Map<string, ImageBytes>();
  const queue = [...new Set(urls)];
  const worker = async () => {
    for (let url = queue.shift(); url; url = queue.shift()) {
      let bytes = await getBytes(sizedImage(url, width), "image/png,image/jpeg;q=0.9");
      let kind = bytes && kindOf(bytes);
      if (!kind) {
        const u = new URL(sizedImage(url, width));
        u.searchParams.set("format", "jpg");
        bytes = await getBytes(u.toString(), "image/jpeg");
        kind = bytes && kindOf(bytes);
      }
      if (bytes && kind) out.set(url, { bytes, kind });
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  return out;
}

/** Fichier du dossier public du site (logos), lu par HTTP comme pour les factures. */
export async function publicFile(path: string, origin: string): Promise<Uint8Array | null> {
  try {
    const res = await fetch(new URL(path, origin), { cache: "force-cache", signal: AbortSignal.timeout(8_000) });
    return res.ok ? new Uint8Array(await res.arrayBuffer()) : null;
  } catch {
    return null;
  }
}
