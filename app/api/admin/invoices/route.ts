import { NextResponse } from "next/server";
import { QTY_MAX } from "@/lib/cart";
import { requireAdmin } from "@/lib/guard";
import { MAX_LINES, buildRows, saveInvoice } from "@/lib/invoices";

/**
 * Confirmer une facture : { commercialId, lines: [{ id, qty }] }.
 * Les prix sont recalculés ici (catalogue + prix du commercial), la facture est figée et numérotée.
 */
export async function POST(req: Request) {
  const denied = await requireAdmin(req, { write: true });
  if (denied) return denied;

  const body = (await req.json().catch(() => null)) as { commercialId?: unknown; lines?: unknown } | null;
  const lines = Array.isArray(body?.lines) ? body.lines : null;
  if (typeof body?.commercialId !== "string" || !lines || !lines.length || lines.length > MAX_LINES) {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }
  const clean: { id: string; qty: number }[] = [];
  for (const l of lines as { id?: unknown; qty?: unknown }[]) {
    if (typeof l?.id !== "string" || !Number.isInteger(l.qty) || (l.qty as number) < 1 || (l.qty as number) > QTY_MAX) {
      return NextResponse.json({ error: "Ligne invalide" }, { status: 400 });
    }
    clean.push({ id: l.id, qty: l.qty as number });
  }

  const built = await buildRows(body.commercialId, clean);
  if (!built) return NextResponse.json({ error: "Commercial inconnu" }, { status: 400 });
  if (!built.rows.length) return NextResponse.json({ error: "Aucun produit valide" }, { status: 400 });

  const invoice = await saveInvoice({
    commercialId: built.commercial.id,
    commercial: built.commercial.name,
    city: built.commercial.city,
    rows: built.rows,
  });
  return NextResponse.json({ ok: true, invoice }, { headers: { "Cache-Control": "no-store" } });
}
