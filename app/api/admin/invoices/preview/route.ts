import { NextResponse } from "next/server";
import { requireAdmin, requireStorage } from "@/lib/guard";
import { computeDraft, getInvoice, parseInvoiceBody } from "@/lib/invoices";

/**
 * Brouillon de facture calculé par le serveur (« Voir la facture ») : { commercialId, lines, editId? }.
 * C'est exactement ce qui sera enregistré à la confirmation (même calcul).
 */
export async function POST(req: Request) {
  const denied = await requireAdmin(req, { write: true });
  if (denied) return denied;
  const down = requireStorage();
  if (down) return down;

  const body = (await req.json().catch(() => null)) as { editId?: unknown } | null;
  const parsed = parseInvoiceBody(body);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const original = typeof body?.editId === "number" ? await getInvoice(body.editId) : null;

  const result = await computeDraft(parsed.commercialId, parsed.lines, original);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true, draft: result.draft }, { headers: { "Cache-Control": "no-store" } });
}
