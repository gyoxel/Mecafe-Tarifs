import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { SESSION_COOKIE, SESSION_MAX_AGE, verifySessionToken, type Role, type Session } from "./session";

/** Session courante (Server Components / Route Handlers), ou null. */
export async function getSession(): Promise<Session | null> {
  const jar = await cookies();
  return verifySessionToken(jar.get(SESSION_COOKIE)?.value);
}

export function sessionCookieOptions() {
  return {
    name: SESSION_COOKIE,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_MAX_AGE,
  };
}

const digest = (s: string) => createHash("sha256").update(s).digest();

function safeEqual(a: string, b: string): boolean {
  return timingSafeEqual(digest(a), digest(b));
}

/** Code admin. Le code de démo (« admin ») n'existe qu'en développement. */
function adminCode(): string | undefined {
  return process.env.ADMIN_PASSWORD || (process.env.NODE_ENV !== "production" ? "admin" : undefined);
}

export function authConfigured(): boolean {
  const secretOk = Boolean(process.env.SESSION_SECRET) || process.env.NODE_ENV !== "production";
  return Boolean(adminCode() && secretOk);
}

/** Rôle correspondant au code saisi (seul l'admin se connecte), ou null. */
export function checkPassword(input: string): Role | null {
  const code = adminCode();
  return code && safeEqual(input, code) ? "admin" : null;
}

/** Session admin courante, ou null. */
export async function getAdminSession(): Promise<Session | null> {
  const session = await getSession();
  return session?.role === "admin" ? session : null;
}
