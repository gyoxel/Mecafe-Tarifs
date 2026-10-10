import { requireAdmin } from "@/lib/guard";
import { getInvoice } from "@/lib/invoices";
import { invoicePdf } from "@/lib/invoice-pdf";

type Ctx = { params: Promise<{ id: string }> };

/** Facture confirmée en PDF (partage / téléchargement). */
export async function GET(req: Request, { params }: Ctx) {
  const denied = await requireAdmin(req, { write: false });
  if (denied) return denied;

  const invoice = await getInvoice(Number((await params).id));
  if (!invoice) return new Response("Facture introuvable", { status: 404 });

  // Logo servi par le site lui-même (fichier public).
  const logo = await fetch(new URL("/mecafe-logo.png", req.url), { cache: "force-cache" })
    .then((r) => (r.ok ? r.arrayBuffer() : null))
    .then((b) => (b ? new Uint8Array(b) : null))
    .catch(() => null);

  const pdf = await invoicePdf(invoice, logo);
  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="Facture-${invoice.number}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
