import { NextResponse } from "next/server";
import { authConfigured, checkPassword, sessionCookieOptions } from "@/lib/auth";
import { isSameOrigin } from "@/lib/guard";
import { checkLoginAllowed, clearLoginFailures, clientIp, recordLoginFailure } from "@/lib/rate-limit";
import { createSessionToken } from "@/lib/session";

export async function POST(req: Request) {
  if (!isSameOrigin(req)) return NextResponse.json({ error: "Origine refusée" }, { status: 403 });
  if (!authConfigured()) {
    return NextResponse.json(
      { error: "Configuration manquante : ADMIN_PASSWORD et SESSION_SECRET doivent être définis." },
      { status: 500 },
    );
  }

  const ip = clientIp(req);
  const allowed = checkLoginAllowed(ip);
  if (!allowed.ok) {
    return NextResponse.json(
      { error: "Trop de tentatives. Réessayez dans quelques minutes." },
      { status: 429, headers: { "Retry-After": String(allowed.retryAfter) } },
    );
  }

  const body = (await req.json().catch(() => null)) as { password?: unknown } | null;
  const password = typeof body?.password === "string" ? body.password : "";
  const role = password ? checkPassword(password) : null;

  if (!role) {
    recordLoginFailure(ip);
    await new Promise((r) => setTimeout(r, 400)); // ralentit le brute-force
    return NextResponse.json({ error: "Code incorrect" }, { status: 401 });
  }

  clearLoginFailures(ip);
  const res = NextResponse.json({ ok: true, role });
  res.cookies.set({ ...sessionCookieOptions(), value: await createSessionToken(role) });
  res.headers.set("Cache-Control", "no-store");
  return res;
}
