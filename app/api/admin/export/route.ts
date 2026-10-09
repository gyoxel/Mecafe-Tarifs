import { getCatalog } from "@/lib/catalog";
import { buildCsv } from "@/lib/csv";
import { requireAdmin } from "@/lib/guard";
import { getPrices } from "@/lib/prices";
import { defaultOption } from "@/lib/options";
import { getOptions } from "@/lib/price-options";
import { slug } from "@/lib/format";

export async function GET(req: Request) {
  const denied = await requireAdmin(req, { write: false });
  if (denied) return denied;

  const param = new URL(req.url).searchParams.get("option");
  const [{ items }, prices, options] = await Promise.all([getCatalog(), getPrices(), getOptions()]);
  const option = options.find((o) => o.id === param) ?? defaultOption(options)!;
  const day = new Date().toISOString().slice(0, 10);
  return new Response(buildCsv(items, prices[option.id] ?? {}, option), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="prix-commerciaux-${slug(option.name) || option.id}-${day}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
