import "server-only";
import { cookies } from "next/headers";
import { codeConfigured, codeVersion, verifyCode } from "./credentials";
import { CLIENT_MAX_AGE, SESSION_COOKIE, createSessionToken, verifySessionToken, type Role, type Session } from "./session";

/**
 * Session courante (Server Components / Route Handlers), ou null. Une session ouverte avec un code qui a changé
 * depuis (Gestion › Codes d'accès) n'est plus valable.
 */
export async function getSession(): Promise<Session | null> {
  const jar = await cookies();
  const session = await verifySessionToken(jar.get(SESSION_COOKIE)?.value);
  if (!session) return null;
  try {
    return session.v === (await codeVersion(session.role)) ? session : null;
  } catch {
    return null; // codes illisibles (base injoignable) : on refuse
  }
}

/** Cookie de session : admin = effacé à la fermeture du navigateur ; client = gardé 30 jours. */
export function sessionCookieOptions(role?: Role) {
  return {
    name: SESSION_COOKIE,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    ...(role === "client" ? { maxAge: CLIENT_MAX_AGE } : {}),
  };
}

/** Cookie de session prêt à poser pour ce rôle (avec l'empreinte du code en vigueur). */
export async function sessionCookie(role: Role) {
  return { ...sessionCookieOptions(role), value: await createSessionToken(role, await codeVersion(role)) };
}

export async function authConfigured(): Promise<boolean> {
  const secretOk = Boolean(process.env.SESSION_SECRET) || process.env.NODE_ENV !== "production";
  return secretOk && (await codeConfigured("admin"));
}

/** Rôle correspondant au code saisi (l'admin est testé en premier), ou null. */
export async function checkPassword(input: string): Promise<Role | null> {
  if (await verifyCode("admin", input)) return "admin";
  if (await verifyCode("client", input)) return "client";
  return null;
}

/** Session admin courante, ou null. */
export async function getAdminSession(): Promise<Session | null> {
  const session = await getSession();
  return session?.role === "admin" ? session : null;
}
