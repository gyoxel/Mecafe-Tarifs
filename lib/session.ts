import { SignJWT, jwtVerify } from "jose";

/** Partie "session" sans dépendance Node : utilisable aussi par proxy.ts. */
export type Role = "commercial" | "admin";
export type Session = { role: Role };

export const SESSION_COOKIE = "mecafe_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 jours : les commerciaux ne se reconnectent pas chaque jour

function secretKey(): Uint8Array {
  const secret =
    process.env.SESSION_SECRET ??
    (process.env.NODE_ENV !== "production" ? "dev-only-secret-change-me-0123456789abcdef" : undefined);
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET manquant ou trop court (32 caractères minimum).");
  }
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(role: Role): Promise<string> {
  return new SignJWT({ role })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(secretKey());
}

export async function verifySessionToken(token: string | undefined): Promise<Session | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    return payload.role === "admin" || payload.role === "commercial" ? { role: payload.role } : null;
  } catch {
    return null;
  }
}
