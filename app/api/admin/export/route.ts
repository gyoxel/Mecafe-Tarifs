import { getCatalog } from "@/lib/catalog";
import { buildCsv } from "@/lib/csv";
import { requireAdmin } from "@/lib/guard";
import { getPrices } from "@/lib/prices";

export async function GET(req: Request) {
  const denied = await requireAdmin(req, { write: false });
  if (denied) return denied;

  const [{ items }, prices] = await Promise.all([getCatalog(), getPrices()]);
  const day = new Date().toISOString().slice(0, 10);
  return new Response(buildCsv(items, prices), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="prix-commerciaux-${day}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
