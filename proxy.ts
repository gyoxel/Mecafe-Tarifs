import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

/**
 * Le catalogue (prix du site) est public. Seul l'espace admin exige la session admin :
 * /admin (catalogue avec prix commerciaux), /admin/gestion et /api/admin/*.
 * (Ces pages et routes revérifient la session elles-mêmes : défense en profondeur.)
 */
export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const adminArea = pathname === "/admin" || pathname.startsWith("/admin/") || pathname.startsWith("/api/admin/");
  if (!adminArea) return NextResponse.next();

  const session = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (session?.role === "admin") return NextResponse.next();

  return pathname.startsWith("/api/")
    ? NextResponse.json({ error: "Accès administrateur requis" }, { status: session ? 403 : 401 })
    : NextResponse.redirect(new URL("/login", req.url));
}

export const config = {
  // Fichiers statiques publics (logos, icônes) exclus.
  matcher: ["/((?!_next/static|_next/image|.*\\.(?:png|jpg|jpeg|svg|webp|ico|txt)$).*)"],
};
