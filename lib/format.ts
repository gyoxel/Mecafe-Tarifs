/** Minuscules, sans accents, espaces normalisés : base de la recherche et des tris. */
export function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** 129 → "129 DH" ; 129.5 → "129,50 DH" ; 1290 → "1 290 DH". Manuel pour éviter tout écart serveur/navigateur. */
export function formatDH(amount: number): string {
  const rounded = Math.round(amount * 100) / 100;
  const [int, dec] = rounded.toFixed(2).split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${grouped}${dec === "00" ? "" : "," + dec} DH`;
}

export function slug(value: string): string {
  return fold(value).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
