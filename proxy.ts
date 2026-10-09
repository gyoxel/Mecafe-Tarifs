import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

/**
 * Porte d'entrée : tout le site exige une session, sauf la page de connexion.
 * (Les routes sensibles revérifient la session elles-mêmes : défense en profondeur.)
 */
const PUBLIC_PATHS = new Set(["/login", "/api/login", "/api/logout", "/api/revalidate"]);

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next();

  const isApi = pathname.startsWith("/api/");
  const session = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);

  if (!session) {
    return isApi
      ? NextResponse.json({ error: "Non connecté" }, { status: 401 })
      : NextResponse.redirect(new URL("/login", req.url));
  }

  const adminArea = pathname === "/admin" || pathname.startsWith("/admin/") || pathname.startsWith("/api/admin/");
  if (adminArea && session.role !== "admin") {
    return isApi
      ? NextResponse.json({ error: "Accès administrateur requis" }, { status: 403 })
      : NextResponse.redirect(new URL("/", req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt).*)"],
};
