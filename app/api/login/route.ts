import { NextResponse } from "next/server";
import { authConfigured, checkPassword, sessionCookie } from "@/lib/auth";
import { isSameOrigin } from "@/lib/guard";
import { checkLoginAllowed, clearLoginFailures, clientIp, recordLoginFailure } from "@/lib/rate-limit";

/** Connexion par code : code clients → catalogue au prix public ; code admin → espace admin. */
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return NextResponse.json({ error: "Origine refusée" }, { status: 403 });
  try {
    if (!(await authConfigured())) {
      return NextResponse.json(
        { error: "Configuration manquante : ADMIN_PASSWORD et SESSION_SECRET doivent être définis." },
        { status: 500 },
      );
    }
  } catch {
    return NextResponse.json({ error: "Service momentanément indisponible. Réessayez." }, { status: 503 });
  }

  const ip = clientIp(req);
  const allowed = checkLoginAllowed(ip);
  if (!allowed.ok) {
    return NextResponse.json(
      { error: "Trop de tentatives. Réessayez dans quelques minutes." },
      { status: 429, headers: { "Retry-After": String(allowed.retryAfter) } },
    );
  }

  // Tentative comptée AVANT la vérification (effacée si le code est bon) : des essais envoyés en même temps ne
  // passent pas tous avant que le premier échec soit enregistré.
  recordLoginFailure(ip);

  const body = (await req.json().catch(() => null)) as { password?: unknown; admin?: unknown } | null;
  const password = typeof body?.password === "string" ? body.password.slice(0, 200) : "";
  let role: Awaited<ReturnType<typeof checkPassword>> = null;
  try {
    role = password ? await checkPassword(password) : null;
  } catch {
    return NextResponse.json({ error: "Service momentanément indisponible. Réessayez." }, { status: 503 });
  }
  // Page « Espace admin » : seul le code admin est accepté.
  if (role === "client" && body?.admin === true) role = null;

  if (!role) {
    await new Promise((r) => setTimeout(r, 400)); // ralentit le brute-force
    return NextResponse.json({ error: "Code incorrect" }, { status: 401 });
  }

  clearLoginFailures(ip);
  const res = NextResponse.json({ ok: true, role });
  res.cookies.set(await sessionCookie(role));
  res.headers.set("Cache-Control", "no-store");
  return res;
}
