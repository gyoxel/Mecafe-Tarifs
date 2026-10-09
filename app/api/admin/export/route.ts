import { getCatalog } from "@/lib/catalog";
import { buildCsv } from "@/lib/csv";
import { requireAdmin } from "@/lib/guard";
import { getPrices } from "@/lib/prices";
import { DEFAULT_OPTION, isOptionId, optionOf } from "@/lib/options";

export async function GET(req: Request) {
  const denied = await requireAdmin(req, { write: false });
  if (denied) return denied;

  const param = new URL(req.url).searchParams.get("option");
  const option = optionOf(isOptionId(param) ? param : DEFAULT_OPTION);
  const [{ items }, prices] = await Promise.all([getCatalog(), getPrices()]);
  const day = new Date().toISOString().slice(0, 10);
  return new Response(buildCsv(items, prices[option.id], option), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="prix-commerciaux-${option.id}-${day}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
