import { NextResponse } from "next/server";
import { getCatalog } from "@/lib/catalog";
import { parseCsv, parsePrice } from "@/lib/csv";
import { requireAdmin } from "@/lib/guard";
import { savePrices, type PriceUpdate } from "@/lib/prices";
import { isOptionId } from "@/lib/options";

const MAX_CSV_CHARS = 2_000_000;

/**
 * Import CSV (export de /api/admin/export modifié dans Excel).
 * Rattachement par variant_id, sinon par sku. Cellule prix_commercial vide = aucun changement.
 * Les prix vont dans l'option choisie sur la page de modification.
 */
export async function POST(req: Request) {
  const denied = await requireAdmin(req, { write: true });
  if (denied) return denied;

  const body = (await req.json().catch(() => null)) as { csv?: unknown; option?: unknown } | null;
  if (!isOptionId(body?.option)) return NextResponse.json({ error: "Option inconnue" }, { status: 400 });
  const option = body.option;
  if (typeof body?.csv !== "string" || body.csv.length > MAX_CSV_CHARS) {
    return NextResponse.json({ error: "Fichier CSV invalide ou trop volumineux" }, { status: 400 });
  }

  const records = parseCsv(body.csv);
  if (!records.length) return NextResponse.json({ error: "Aucune ligne trouvée dans le CSV" }, { status: 400 });
  if (!("prix_commercial" in records[0])) {
    return NextResponse.json({ error: "Colonne « prix_commercial » introuvable" }, { status: 400 });
  }

  const { items } = await getCatalog();
  const byId = new Map(items.map((i) => [i.id, i]));
  const bySku = new Map<string, (typeof items)[number] | null>();
  for (const it of items) {
    if (!it.sku) continue;
    bySku.set(it.sku, bySku.has(it.sku) ? null : it); // SKU en doublon : ambigu, on ne s'en sert pas
  }

  const updates: PriceUpdate[] = [];
  const unmatched: number[] = [];
  const invalid: number[] = [];

  records.forEach((rec, idx) => {
    const line = idx + 2; // numéro de ligne dans le fichier (en-tête = 1)
    const price = parsePrice(rec.prix_commercial);
    if (price === null) return; // vide = ignoré
    const item = (rec.variant_id && byId.get(rec.variant_id)) || (rec.sku ? bySku.get(rec.sku) : undefined);
    if (!item) return void unmatched.push(line);
    if (Number.isNaN(price)) return void invalid.push(line);
    updates.push({
      variantId: item.id,
      price,
      sku: item.sku,
      label: item.variant ? `${item.title} — ${item.variant}` : item.title,
    });
  });

  const result = await savePrices(option, updates);
  return NextResponse.json(
    { ok: true, ...result, unmatchedLines: unmatched.slice(0, 50), invalidLines: invalid.slice(0, 50) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
