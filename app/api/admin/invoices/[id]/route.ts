import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/guard";
import { buildRows, getInvoice, parseInvoiceBody, updateInvoice } from "@/lib/invoices";

type Ctx = { params: Promise<{ id: string }> };

/** Modifier une facture confirmée (même n°) : { commercialId, lines: [{ id, qty }] }, prix recalculés ici. */
export async function PUT(req: Request, { params }: Ctx) {
  const denied = await requireAdmin(req, { write: true });
  if (denied) return denied;

  const id = Number((await params).id);
  if (!(await getInvoice(id))) return NextResponse.json({ error: "Facture introuvable" }, { status: 404 });

  const parsed = parseInvoiceBody(await req.json().catch(() => null));
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const built = await buildRows(parsed.commercialId, parsed.lines);
  if (!built) return NextResponse.json({ error: "Commercial inconnu" }, { status: 400 });
  if (!built.rows.length) return NextResponse.json({ error: "Aucun produit valide" }, { status: 400 });

  const invoice = await updateInvoice(id, {
    commercialId: built.commercial.id,
    commercial: built.commercial.name,
    city: built.commercial.city,
    rows: built.rows,
  });
  if (!invoice) return NextResponse.json({ error: "Facture introuvable" }, { status: 404 });
  return NextResponse.json({ ok: true, invoice }, { headers: { "Cache-Control": "no-store" } });
}
