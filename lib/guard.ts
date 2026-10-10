import "server-only";
import { NextResponse } from "next/server";
import { getSession } from "./auth";
import { STORAGE_DOWN_MESSAGE, storageDown } from "./db";

/** Refuse les requêtes d'écriture venant d'une autre origine (défense CSRF en plus de SameSite=Lax). */
export function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true; // appels non-navigateur (curl) : de toute façon protégés par le cookie
  try {
    return new URL(origin).host === req.headers.get("host");
  } catch {
    return false;
  }
}

/** Garde pour les routes /api/admin/* : même origine + session admin. Retourne une réponse d'erreur, ou null si OK. */
export async function requireAdmin(req: Request, opts: { write: boolean }): Promise<NextResponse | null> {
  if (opts.write && !isSameOrigin(req)) return NextResponse.json({ error: "Origine refusée" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Accès administrateur requis" }, { status: 403 });
  return null;
}

/**
 * Garde des routes qui enregistrent : sans base de données en production, refus net (503) avec un message clair,
 * plutôt qu'un enregistrement en mémoire perdu en silence. Retourne une réponse d'erreur, ou null si OK.
 */
export function requireStorage(): NextResponse | null {
  return storageDown() ? NextResponse.json({ error: STORAGE_DOWN_MESSAGE }, { status: 503 }) : null;
}
