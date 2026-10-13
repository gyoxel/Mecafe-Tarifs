import "server-only";
import { createHash, createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { assertDurableStorage, ensureSchema, getSql, isDbConfigured } from "./db";
import type { Role } from "./session";

/**
 * Codes d'accès : « client » (catalogue au prix public) et « admin ».
 * Un code modifié dans Gestion est enregistré en base sous forme d'empreinte scrypt (jamais en clair) et remplace
 * celui de Vercel (APP_PASSWORD / ADMIN_PASSWORD), qui ne sert alors plus que de secours si la ligne est effacée.
 * Chaque session porte l'empreinte courte du code en vigueur : changer un code déconnecte les sessions ouvertes
 * avec l'ancien.
 */

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;
const KEY_LEN = 32;
export const CODE_MIN: Record<Role, number> = { client: 6, admin: 8 };
export const CODE_MAX = 100;

type Stored = { hash: string; updatedAt: string };

const g = globalThis as unknown as {
  __codes?: { at: number; rows: Partial<Record<Role, Stored>> };
  __memCodes?: Partial<Record<Role, Stored>>;
};
/** Les codes sont relus en base au plus toutes les 10 s par instance. */
const CACHE_MS = 10_000;

const dev = process.env.NODE_ENV !== "production";
/** Code défini dans Vercel (les codes de démo n'existent qu'en développement). */
function envCode(role: Role): string | undefined {
  return role === "admin"
    ? process.env.ADMIN_PASSWORD || (dev ? "admin" : undefined)
    : process.env.APP_PASSWORD || (dev ? "demo" : undefined);
}

async function storedCodes(): Promise<Partial<Record<Role, Stored>>> {
  if (!isDbConfigured()) return (g.__memCodes ??= {});
  if (g.__codes && Date.now() - g.__codes.at < CACHE_MS) return g.__codes.rows;
  try {
    await ensureSchema();
    const rows = await getSql()<{ key: string; value: string; updated_at: Date }[]>`
      select key, value, updated_at from app_settings where key in ('password:admin', 'password:client')`;
    const out: Partial<Record<Role, Stored>> = {};
    for (const r of rows) {
      const role = r.key.slice("password:".length) as Role;
      out[role] = { hash: r.value, updatedAt: r.updated_at.toISOString() };
    }
    g.__codes = { at: Date.now(), rows: out };
    return out;
  } catch (err) {
    // Base injoignable : dernières valeurs connues. Sans elles, on refuse plutôt que de revenir au code de
    // Vercel (qui ne doit plus ouvrir le site une fois le code changé dans Gestion).
    if (g.__codes) return g.__codes.rows;
    throw err;
  }
}

async function hashCode(code: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(code, salt, KEY_LEN);
  return `scrypt$${salt.toString("base64")}$${key.toString("base64")}`;
}

async function matchesHash(code: string, stored: string): Promise<boolean> {
  const [algo, salt, key] = stored.split("$");
  if (algo !== "scrypt" || !salt || !key) return false;
  const expected = Buffer.from(key, "base64");
  const actual = await scrypt(code, Buffer.from(salt, "base64"), expected.length);
  return timingSafeEqual(actual, expected);
}

const digest = (s: string) => createHash("sha256").update(s).digest();

/** Le code saisi est-il celui du rôle ? (comparaison à temps constant) */
export async function verifyCode(role: Role, input: string): Promise<boolean> {
  if (!input) return false;
  const stored = (await storedCodes())[role];
  if (stored) return matchesHash(input, stored.hash);
  const env = envCode(role);
  return Boolean(env) && timingSafeEqual(digest(input), digest(env!));
}

/** Empreinte courte du code en vigueur, glissée dans la session (change avec le code). */
export async function codeVersion(role: Role): Promise<string> {
  const stored = (await storedCodes())[role];
  if (stored) return createHash("sha256").update(`${role}:${stored.hash}`).digest("hex").slice(0, 16);
  // Code de Vercel (en clair) : empreinte signée avec SESSION_SECRET, pour qu'un cookie de session ne permette
  // pas de retrouver le code en essayant des milliers de codes hors ligne.
  const secret = process.env.SESSION_SECRET ?? "dev-only-secret-change-me-0123456789abcdef";
  return createHmac("sha256", secret).update(`${role}:env:${envCode(role) ?? ""}`).digest("hex").slice(0, 16);
}

/** Un code est-il défini pour ce rôle (Gestion ou Vercel) ? */
export async function codeConfigured(role: Role): Promise<boolean> {
  return Boolean((await storedCodes())[role] || envCode(role));
}

/** Où est défini chaque code, et quand il a été changé dans Gestion. */
export async function codesInfo(): Promise<Record<Role, { source: "gestion" | "vercel" | "aucun"; updatedAt: string | null }>> {
  const stored = await storedCodes();
  const one = (role: Role) =>
    stored[role]
      ? { source: "gestion" as const, updatedAt: stored[role]!.updatedAt }
      : { source: envCode(role) ? ("vercel" as const) : ("aucun" as const), updatedAt: null };
  return { admin: one("admin"), client: one("client") };
}

/** Enregistre un nouveau code (empreinte seulement). */
export async function setCode(role: Role, code: string): Promise<void> {
  assertDurableStorage();
  const hash = await hashCode(code);
  if (!isDbConfigured()) {
    (g.__memCodes ??= {})[role] = { hash, updatedAt: new Date().toISOString() };
    return;
  }
  await ensureSchema();
  await getSql()`
    insert into app_settings (key, value, updated_at) values (${`password:${role}`}, ${hash}, now())
    on conflict (key) do update set value = excluded.value, updated_at = now()`;
  g.__codes = undefined;
}
