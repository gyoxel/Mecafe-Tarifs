import type { MetadataRoute } from "next";

/**
 * Le site ne doit apparaître dans aucun moteur de recherche. Chaque réponse porte
 * « X-Robots-Tag: noindex » (next.config.ts) et chaque page <meta name="robots" content="noindex">.
 * On laisse donc l'exploration ouverte : un robot bloqué par robots.txt ne verrait pas ce noindex
 * et pourrait garder l'adresse en mémoire si elle était citée ailleurs.
 */
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", allow: "/" } };
}
