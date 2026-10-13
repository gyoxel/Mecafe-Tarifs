import { NextResponse } from "next/server";
import { requireAdmin, requireStorage } from "@/lib/guard";
import { computeDraft, deleteInvoices, matchesExpected, parseInvoiceBody, saveInvoice } from "@/lib/invoices";

/**
 * Confirmer un devis : { commercialId, lines: [{ id, qty }], expected }.
 * Les prix sont recalculés ici ; si le calcul diffère du brouillon affiché (`expected`), rien n'est enregistré
 * (409) et le nouveau brouillon est renvoyé pour vérification.
 */
export async function POST(req: Request) {
  const denied = await requireAdmin(req, { write: true });
  if (denied) return denied;
  const down = requireStorage();
  if (down) return down;

  const parsed = parseInvoiceBody(await req.json().catch(() => null));
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  if (!parsed.expected) return NextResponse.json({ error: "Aperçu manquant : ouvrez le devis avant de confirmer." }, { status: 400 });

  const result = await computeDraft(parsed.commercialId, parsed.lines);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  const { draft } = result;
  if (!matchesExpected(draft, parsed.expected)) {
    return NextResponse.json(
      { error: "Les prix ont changé depuis l'aperçu : vérifiez les nouveaux montants, puis confirmez.", draft },
      { status: 409 },
    );
  }

  const invoice = await saveInvoice({
    commercialId: draft.commercial.id,
    commercial: draft.commercial.name,
    city: draft.commercial.city,
    rows: draft.rows,
  });
  return NextResponse.json({ ok: true, invoice }, { headers: { "Cache-Control": "no-store" } });
}

/** Supprimer les devis sélectionnés : { ids: number[] }. Retirés de l'historique ; leurs n° ne sont pas réutilisés. */
export async function DELETE(req: Request) {
  const denied = await requireAdmin(req, { write: true });
  if (denied) return denied;
  const down = requireStorage();
  if (down) return down;

  const body = (await req.json().catch(() => null)) as { ids?: unknown } | null;
  const ids = Array.isArray(body?.ids) ? body.ids : null;
  if (!ids || !ids.length || ids.length > 1000 || !ids.every((id) => Number.isSafeInteger(id))) {
    return NextResponse.json({ error: "Sélection invalide" }, { status: 400 });
  }
  const deleted = await deleteInvoices(ids as number[]);
  return NextResponse.json({ ok: true, deleted }, { headers: { "Cache-Control": "no-store" } });
}
