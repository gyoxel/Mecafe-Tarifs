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
};

/** Facture confirmée, enregistrée dans l'historique. */
export type SavedInvoice = {
  id: number;
  number: string;
  commercialId: string | null;
  commercial: string;
  city: string | null;
  rows: InvoiceRow[];
  count: number;
  total: number;
  status: "confirmee";
  /** ISO 8601. */
  createdAt: string;
};

export const sumRows = (rows: InvoiceRow[]) => ({
  count: rows.reduce((n, r) => n + r.qty, 0),
  total: Math.round(rows.reduce((s, r) => s + r.total, 0) * 100) / 100,
});
