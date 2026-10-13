import { sumMoney } from "./money";

/** Ligne de facture telle qu'imprimée (figée à la confirmation : les prix ne bougent plus ensuite). */
export type InvoiceRow = {
  variantId: string;
  brand: string;
  /** Nom affiché du produit. */
  name: string;
  /** Format affiché (« 1 kg »…), ou null. */
  variant: string | null;
  sku: string | null;
  qty: number;
  unit: number;
  total: number;
  /** true : pas de prix commercial, prix du site. */
  sitePrice: boolean;
  /** true : prix unitaire saisi à la main dans le panier (au lieu du prix du revendeur). */
  manual?: boolean;
};

/** Type de document choisi dans le panier : devis (D…) ou commande (C…), numérotés à part. */
export type DocKind = "devis" | "commande";
export const DOC_KINDS: DocKind[] = ["devis", "commande"];
export const KIND_LABEL: Record<DocKind, string> = { devis: "Devis", commande: "Commande" };
/** Article défini : « le devis », « la commande ». */
export const KIND_THE: Record<DocKind, string> = { devis: "le devis", commande: "la commande" };
export const KIND_PREFIX: Record<DocKind, string> = { devis: "D", commande: "C" };
export const isDocKind = (v: unknown): v is DocKind => v === "devis" || v === "commande";
/** Type d'un document d'après son n° (C… = commande ; D… et anciens F… = devis). */
export const kindOfNumber = (n: string | null | undefined): DocKind => (n?.startsWith("C") ? "commande" : "devis");

/** Facture confirmée, enregistrée dans l'historique. */
export type SavedInvoice = {
  id: number;
  number: string;
  kind: DocKind;
  commercialId: string | null;
  commercial: string;
  city: string | null;
  rows: InvoiceRow[];
  count: number;
  total: number;
  status: "confirmee";
  /** ISO 8601. */
  createdAt: string;
  /** ISO 8601 de la dernière modification après confirmation, ou null. */
  updatedAt: string | null;
};

export const sumRows = (rows: InvoiceRow[]) => ({
  count: rows.reduce((n, r) => n + r.qty, 0),
  total: sumMoney(rows.map((r) => r.total)),
});

/** Brouillon calculé par le serveur : exactement ce qui sera enregistré à la confirmation. */
export type Draft = {
  rows: InvoiceRow[];
  count: number;
  total: number;
  commercial: { id: string; name: string; city: string | null };
  /** Modification : produits dont le prix unitaire a changé par rapport à la facture d'origine. */
  changes: { name: string; variant: string | null; before: number; after: number }[];
};
