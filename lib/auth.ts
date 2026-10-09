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

/** Les mots de passe de démo n'existent qu'en développement. */
function configuredPasswords(): { app?: string; admin?: string } {
  const dev = process.env.NODE_ENV !== "production";
  return {
    app: process.env.APP_PASSWORD || (dev ? "demo" : undefined),
    admin: process.env.ADMIN_PASSWORD || (dev ? "admin" : undefined),
  };
}

export function authConfigured(): boolean {
  const { app, admin } = configuredPasswords();
  const secretOk = Boolean(process.env.SESSION_SECRET) || process.env.NODE_ENV !== "production";
  return Boolean(app && admin && secretOk);
}

/** Retourne le rôle correspondant au mot de passe, ou null. L'admin est testé en premier. */
export function checkPassword(input: string): Role | null {
  const { app, admin } = configuredPasswords();
  const isAdmin = admin ? safeEqual(input, admin) : false;
  const isApp = app ? safeEqual(input, app) : false;
  return isAdmin ? "admin" : isApp ? "commercial" : null;
}
