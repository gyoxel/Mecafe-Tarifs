/** Minuscules, sans accents, espaces normalisés : base de la recherche et des tris. */
export function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** 129 → "129" ; 129.5 → "129,50" ; 1290 → "1 290". Manuel pour éviter tout écart serveur/navigateur. */
export function formatAmount(amount: number): string {
  const rounded = Math.round(amount * 100) / 100;
  const [int, dec] = rounded.toFixed(2).split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${grouped}${dec === "00" ? "" : "," + dec}`;
}

/** 129 → "129 DH" */
export function formatDH(amount: number): string {
  return `${formatAmount(amount)} DH`;
}

export function slug(value: string): string {
  return fold(value).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/** 1290.5 → { main: "1 290", dec: ",50" } : pour styliser séparément le montant et la devise. */
export function splitDH(amount: number): { main: string; dec: string } {
  const [int, dec] = (Math.round(amount * 100) / 100).toFixed(2).split(".");
  return { main: int.replace(/\B(?=(\d{3})+(?!\d))/g, " "), dec: dec === "00" ? "" : "," + dec };
}
