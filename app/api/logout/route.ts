import { NextResponse } from "next/server";
import { sessionCookieOptions } from "@/lib/auth";
import { isSameOrigin } from "@/lib/guard";

export async function POST(req: Request) {
  if (!isSameOrigin(req)) return NextResponse.json({ error: "Origine refusée" }, { status: 403 });
  const res = NextResponse.json({ ok: true });
  res.cookies.set({ ...sessionCookieOptions(), value: "", maxAge: 0 });
  return res;
}
