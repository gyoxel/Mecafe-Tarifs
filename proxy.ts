import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

/**
 * Porte d'entrée : tout le site demande un code (page /login), sauf la connexion elle-même.
 * - code clients : catalogue au prix public ;
 * - code admin : en plus /admin (prix revendeurs), /admin/gestion et /api/admin/*.
 * Les pages et routes revérifient la session elles-mêmes, y compris l'empreinte du code (un code changé
 * dans Gestion déconnecte les sessions ouvertes avec l'ancien) : défense en profondeur.
 */
const PUBLIC_PATHS = new Set(["/login", "/api/login", "/api/logout"]);

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next();

  const isApi = pathname.startsWith("/api/");
  const adminArea = pathname === "/admin" || pathname.startsWith("/admin/") || pathname.startsWith("/api/admin/");
  const session = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);

  if (session?.role === "admin" || (session && !adminArea)) return NextResponse.next();
  if (isApi) {
    return NextResponse.json(
      { error: session ? "Accès administrateur requis" : "Non connecté" },
      { status: session ? 403 : 401 },
    );
  }
  return NextResponse.redirect(new URL(adminArea ? "/login?admin=1" : "/login", req.url));
}

export const config = {
  // Fichiers statiques publics (logos, icônes) exclus : ils s'affichent sur la page de connexion.
  matcher: ["/((?!_next/static|_next/image|.*\\.(?:png|jpg|jpeg|svg|webp|ico|txt)$).*)"],
};
