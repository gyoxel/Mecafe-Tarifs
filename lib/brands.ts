import { fold } from "./format";

/**
 * Pastilles rondes des marques (fichiers carrés, fond ivoire, dans public/brands/).
 * Pour ajouter une marque : déposer le fichier et l'ajouter ici (clé = nom de marque affiché).
 * Sans fichier, la marque s'affiche en typographie dans une pastille (BrandLogo).
 */
export const BRAND_LOGOS: Record<string, { src: string; width: number; height: number }> = {
  Mécafé: { src: "/brands/mecafe.png", width: 418, height: 418 },
};

export function brandLogo(brand: string) {
  const key = Object.keys(BRAND_LOGOS).find((b) => fold(b) === fold(brand));
  return key ? BRAND_LOGOS[key] : undefined;
}
