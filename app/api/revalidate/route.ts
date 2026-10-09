import { createHmac, timingSafeEqual } from "node:crypto";
import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { CATALOG_TAG } from "@/lib/shopify";

/**
 * Webhook Shopify (products/create, products/update, products/delete) :
 * vide le cache du catalogue pour que le prix modifié apparaisse immédiatement.
 * Authentifié par la signature HMAC de Shopify (pas par la session).
 */
export async function POST(req: Request) {
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET;
  if (!secret) return new NextResponse(null, { status: 404 });

  const raw = await req.text();
  const received = req.headers.get("x-shopify-hmac-sha256") ?? "";
  const expected = createHmac("sha256", secret).update(raw).digest("base64");

  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return new NextResponse(null, { status: 401 });

  revalidateTag(CATALOG_TAG, { expire: 0 });
  return NextResponse.json({ ok: true });
}
