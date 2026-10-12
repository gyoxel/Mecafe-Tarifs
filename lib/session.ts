import { SignJWT, jwtVerify } from "jose";

/** Partie "session" sans dépendance Node : utilisable aussi par proxy.ts. */
export type Role = "admin" | "client";
/** `v` : empreinte du code en vigueur à la connexion (un code changé invalide les sessions ouvertes avec l'ancien). */
export type Session = { role: Role; v: string };

export const SESSION_COOKIE = "mecafe_session";
/** Admin : 12 h au plus, et cookie de session (fermer le navigateur déconnecte). */
export const SESSION_MAX_AGE = 60 * 60 * 12;
/** Client (code clients) : reste connecté 30 jours sur l'appareil. */
export const CLIENT_MAX_AGE = 60 * 60 * 24 * 30;

function secretKey(): Uint8Array {
  const secret =
    process.env.SESSION_SECRET ??
    (process.env.NODE_ENV !== "production" ? "dev-only-secret-change-me-0123456789abcdef" : undefined);
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET manquant ou trop court (32 caractères minimum).");
  }
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(role: Role, v: string): Promise<string> {
  return new SignJWT({ role, v })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${role === "admin" ? SESSION_MAX_AGE : CLIENT_MAX_AGE}s`)
    .sign(secretKey());
}

/** Vérifie la signature et l'expiration (l'empreinte du code est revérifiée côté serveur, cf. lib/auth). */
export async function verifySessionToken(token: string | undefined): Promise<Session | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    const role = payload.role === "admin" || payload.role === "client" ? payload.role : null;
    return role && typeof payload.v === "string" ? { role, v: payload.v } : null;
  } catch {
    return null;
  }
}
