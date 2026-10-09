type Params = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/** Filtres repris de l'URL (?q=…&marque=…&categorie=a/b/c ; ancien ?sous= accepté). */
export function initialFilters(sp: Params) {
  return {
    q: first(sp.q),
    brand: first(sp.marque),
    path: [...first(sp.categorie).split("/"), first(sp.sous)].filter(Boolean),
  };
}
