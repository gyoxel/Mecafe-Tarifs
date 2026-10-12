import { NextResponse } from "next/server";
import { sessionCookie } from "@/lib/auth";
import { CODE_MAX, CODE_MIN, codesInfo, setCode, verifyCode } from "@/lib/credentials";
import { requireAdmin, requireStorage } from "@/lib/guard";
import { checkLoginAllowed, clearLoginFailures, clientIp, recordLoginFailure } from "@/lib/rate-limit";
import type { Role } from "@/lib/session";

/**
 * Changer un code d'accès (Gestion › Codes d'accès). Corps : `target` (client | admin), `next` (nouveau code),
 * `current` (code admin actuel : demandé seulement pour changer le code admin). Les sessions ouvertes avec l'ancien code sont
 * déconnectées ; l'admin qui change le code admin reste connecté (nouveau cookie).
 */
export async function POST(req: Request) {
  const denied = await requireAdmin(req, { write: true });
  if (denied) return denied;
  const down = requireStorage();
  if (down) return down;

  const body = (await req.json().catch(() => null)) as { target?: unknown; current?: unknown; next?: unknown } | null;
  const target: Role | null = body?.target === "admin" || body?.target === "client" ? body.target : null;
  const current = typeof body?.current === "string" ? body.current : "";
  const next = typeof body?.next === "string" ? body.next : "";
  if (!target) return NextResponse.json({ error: "Code inconnu" }, { status: 400 });

  if (target === "admin") {
    const ip = clientIp(req);
    if (!checkLoginAllowed(ip).ok) {
      return NextResponse.json({ error: "Trop de tentatives. Réessayez dans quelques minutes." }, { status: 429 });
    }
    if (!(await verifyCode("admin", current))) {
      recordLoginFailure(ip);
      await new Promise((r) => setTimeout(r, 400));
      return NextResponse.json({ error: "Code admin actuel incorrect" }, { status: 403 });
    }
    clearLoginFailures(ip);
  }

  if (next.trim() !== next) return NextResponse.json({ error: "Pas d'espace au début ni à la fin du code" }, { status: 400 });
  if (next.length < CODE_MIN[target] || next.length > CODE_MAX) {
    return NextResponse.json({ error: `Le code doit faire au moins ${CODE_MIN[target]} caractères` }, { status: 400 });
  }
  const other: Role = target === "admin" ? "client" : "admin";
  if (await verifyCode(other, next)) {
    return NextResponse.json({ error: "Le code clients et le code admin doivent être différents" }, { status: 400 });
  }

  await setCode(target, next);
  const res = NextResponse.json({ ok: true, info: await codesInfo() }, { headers: { "Cache-Control": "no-store" } });
  // Le code admin a changé : la session en cours est renouvelée (les autres appareils sont déconnectés).
  if (target === "admin") res.cookies.set(await sessionCookie("admin"));
  return res;
}
