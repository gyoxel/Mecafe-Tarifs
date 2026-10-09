import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/guard";
import { CATALOG_TAG } from "@/lib/shopify";

/** Bouton « Rafraîchir depuis Shopify » : vide le cache du catalogue immédiatement. */
export async function POST(req: Request) {
  const denied = await requireAdmin(req, { write: true });
  if (denied) return denied;
  revalidateTag(CATALOG_TAG, { expire: 0 });
  return NextResponse.json({ ok: true });
}
