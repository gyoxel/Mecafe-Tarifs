import { NextResponse } from "next/server";
import { getCatalog } from "@/lib/catalog";
import { requireAdmin } from "@/lib/guard";
import { savePrices, type PriceUpdate } from "@/lib/prices";
import { parsePrice } from "@/lib/csv";
import { getOptions } from "@/lib/price-options";

const MAX_UPDATES = 2000;

export async function POST(req: Request) {
  const denied = await requireAdmin(req, { write: true });
  if (denied) return denied;

  const body = (await req.json().catch(() => null)) as { updates?: unknown; option?: unknown } | null;
  if (!Array.isArray(body?.updates) || body.updates.length > MAX_UPDATES) {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }
  const option = (await getOptions()).find((o) => o.id === body.option)?.id;
  if (!option) return NextResponse.json({ error: "Option inconnue" }, { status: 400 });

  const { items } = await getCatalog();
  const byId = new Map(items.map((i) => [i.id, i]));

  const updates: PriceUpdate[] = [];
  for (const raw of body.updates as { variantId?: unknown; price?: unknown }[]) {
    const item = typeof raw?.variantId === "string" ? byId.get(raw.variantId) : undefined;
    if (!item) return NextResponse.json({ error: `Produit inconnu : ${String(raw?.variantId)}` }, { status: 400 });

    const price = raw.price == null ? null : typeof raw.price === "number" ? raw.price : parsePrice(String(raw.price));
    if (price != null && (!Number.isFinite(price) || price < 0)) {
      return NextResponse.json({ error: `Prix invalide pour ${item.title}` }, { status: 400 });
    }
    updates.push({
      variantId: item.id,
      price: price == null ? null : Math.round(price * 100) / 100,
      sku: item.sku,
      label: item.variant ? `${item.title} — ${item.variant}` : item.title,
    });
  }

  const result = await savePrices(option, updates);
  return NextResponse.json({ ok: true, ...result }, { headers: { "Cache-Control": "no-store" } });
}
