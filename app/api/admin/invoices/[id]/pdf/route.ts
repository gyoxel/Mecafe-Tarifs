import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { requireAdmin } from "@/lib/guard";
import { getInvoice } from "@/lib/invoices";
import { invoicePdf } from "@/lib/invoice-pdf";
import { KIND_LABEL } from "@/lib/invoice-types";

type Ctx = { params: Promise<{ id: string }> };

/** Devis ou commande confirmé(e) en PDF, sur l'en-tête officiel (partage / téléchargement). */
export async function GET(req: Request, { params }: Ctx) {
  const denied = await requireAdmin(req, { write: false });
  if (denied) return denied;

  const invoice = await getInvoice(Number((await params).id));
  if (!invoice) return new Response("Document introuvable", { status: 404 });

  // Chemin écrit en entier : le fichier est embarqué avec la fonction.
  const letterhead = await readFile(join(process.cwd(), "assets/devis/entete.pdf")).catch(() => null);
  const pdf = await invoicePdf(invoice, letterhead);
  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${KIND_LABEL[invoice.kind]}-${invoice.number}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
