import { fold } from "./format";

type BrandStyle = {
  /** Couleur de la marque (libellés, pastilles). */
  color: string;
  /** Logo rond (fichier carré dans public/brands/), optionnel. */
  logo?: string;
};

/**
 * Identité des marques. Pour ajouter un logo : déposer un PNG carré dans public/brands/
 * et renseigner `logo`. Sans logo, la marque s'affiche en typographie à sa couleur.
 */
const BRANDS: Record<string, BrandStyle> = {
  Mécafé: { color: "#a8742a", logo: "/brands/mecafe.png" },
  Kimbo: { color: "#c8102e", logo: "/brands/kimbo.png" },
  Caffitaly: { color: "#1d7a46", logo: "/brands/caffitaly.png" },
  ODK: { color: "#52726a", logo: "/brands/odk.png" }, // vert « chiba » (sauge)
  Foodness: { color: "#4f9a35", logo: "/brands/foodness.png" },
  Flair: { color: "#8a1c2b", logo: "/brands/flair.png" },
};

const DEFAULT: BrandStyle = { color: "#3d4250" };

export function brandStyle(brand: string): BrandStyle {
  const key = Object.keys(BRANDS).find((b) => fold(b) === fold(brand));
  return key ? BRANDS[key] : DEFAULT;
}
