import { NextResponse } from "next/server";
import { requireAdmin, requireStorage } from "@/lib/guard";
import { computeDraft, getInvoice, matchesExpected, parseInvoiceBody, updateInvoice } from "@/lib/invoices";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Modifier une facture confirmée (même n°) : { commercialId, lines, expected }, prix recalculés ici et
 * comparés au brouillon affiché, comme pour une nouvelle facture.
 */
export async function PUT(req: Request, { params }: Ctx) {
  const denied = await requireAdmin(req, { write: true });
  if (denied) return denied;
  const down = requireStorage();
  if (down) return down;

  const original = await getInvoice(Number((await params).id));
  if (!original) return NextResponse.json({ error: "Facture introuvable" }, { status: 404 });

  const parsed = parseInvoiceBody(await req.json().catch(() => null));
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  if (!parsed.expected) return NextResponse.json({ error: "Aperçu manquant : ouvrez la facture avant d'enregistrer." }, { status: 400 });

  const result = await computeDraft(parsed.commercialId, parsed.lines, original);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  const { draft } = result;
  if (!matchesExpected(draft, parsed.expected)) {
    return NextResponse.json(
      { error: "Les prix ont changé depuis l'aperçu : vérifiez les nouveaux montants, puis enregistrez.", draft },
      { status: 409 },
    );
  }

  const invoice = await updateInvoice(original.id, {
    commercialId: draft.commercial.id,
    commercial: draft.commercial.name,
    city: draft.commercial.city,
    rows: draft.rows,
  });
  if (!invoice) return NextResponse.json({ error: "Facture introuvable" }, { status: 404 });
  return NextResponse.json({ ok: true, invoice }, { headers: { "Cache-Control": "no-store" } });
}
