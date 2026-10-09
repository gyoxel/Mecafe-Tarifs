/**
 * Limiteur de tentatives de connexion, en mémoire (par instance serverless).
 * C'est un frein simple ; pour une garantie stricte, ajouter une règle de
 * rate-limit dans le Vercel Firewall sur POST /api/login.
 */
const WINDOW_MS = 10 * 60 * 1000;
const MAX_FAILURES = 8;

type Entry = { failures: number; resetAt: number };
const g = globalThis as unknown as { __loginAttempts?: Map<string, Entry> };
const attempts = (g.__loginAttempts ??= new Map<string, Entry>());

export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}

export function checkLoginAllowed(ip: string): { ok: boolean; retryAfter: number } {
  const e = attempts.get(ip);
  if (!e || e.resetAt <= Date.now()) return { ok: true, retryAfter: 0 };
  return e.failures >= MAX_FAILURES
    ? { ok: false, retryAfter: Math.ceil((e.resetAt - Date.now()) / 1000) }
    : { ok: true, retryAfter: 0 };
}

export function recordLoginFailure(ip: string) {
  const now = Date.now();
  const e = attempts.get(ip);
  if (!e || e.resetAt <= now) attempts.set(ip, { failures: 1, resetAt: now + WINDOW_MS });
  else e.failures++;
  if (attempts.size > 5000) for (const [k, v] of attempts) if (v.resetAt <= now) attempts.delete(k);
}

export function clearLoginFailures(ip: string) {
  attempts.delete(ip);
}
