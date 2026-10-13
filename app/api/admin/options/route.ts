import { NextResponse } from "next/server";
import { capFirst, fold } from "@/lib/format";
import { requireAdmin, requireStorage } from "@/lib/guard";
import { BASE_ID, NAME_MAX, PHONE_MAX, cleanPhone, type PriceSource } from "@/lib/options";
import { CITY_MAX, cityChoices, normalizeCity } from "@/lib/cities";
import { ensureOffsetsFrozen } from "@/lib/price-freeze";
import { createOption, deleteOption, getOptions, reorderOptions, updateOption } from "@/lib/price-options";

/**
 * Gestion des revendeurs.
 * Corps : { action: "create", name, city?, phone?, source? } | { action: "update", id, name?, city?, phone?, source? }
 *       | { action: "delete", id } | { action: "reorder", ids }   (city : texte, ou null / "" pour aucune ville)
 * source : modèle suivi pour les produits sans prix saisi, « base » (Prix Gros, par défaut) ou « site ».
 * La base « Prix Gros » ne se renomme pas et ne se supprime pas.
 * Réponse : la liste complète des revendeurs.
 */
type Body = {
  action?: unknown;
  id?: unknown;
  ids?: unknown;
  name?: unknown;
  city?: unknown;
  phone?: unknown;
  source?: unknown;
};

const fail = (error: string) => NextResponse.json({ error }, { status: 400 });

export async function POST(req: Request) {
  const denied = await requireAdmin(req, { write: true });
  if (denied) return denied;
  const down = requireStorage();
  if (down) return down;

  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body) return fail("Requête invalide");
  const options = await getOptions();
  const target = typeof body.id === "string" ? options.find((o) => o.id === body.id) : undefined;

  // Première lettre toujours en majuscule.
  const name = typeof body.name === "string" ? capFirst(body.name.trim().replace(/\s+/g, " ")) : undefined;
  if (name !== undefined) {
    if (!name || name.length > NAME_MAX) return fail(`Nom requis (${NAME_MAX} caractères au plus)`);
    if (options.some((o) => o.id !== target?.id && fold(o.name) === fold(name))) {
      return fail(`Le revendeur « ${name} » existe déjà`);
    }
  }
  let city: string | null | undefined;
  if (body.city === null || body.city === "") city = null;
  else if (typeof body.city === "string") {
    city = normalizeCity(body.city, cityChoices(options.map((o) => o.city))) || null;
    if (city && city.length > CITY_MAX) return fail(`Ville trop longue (${CITY_MAX} caractères au plus)`);
  } else if (body.city !== undefined) return fail("Ville invalide");

  if (body.source !== undefined && body.source !== "base" && body.source !== "site") return fail("Modèle invalide");
  // Téléphone facultatif : absent = inchangé, "" ou null = effacé.
  let phone: string | null | undefined;
  if (body.phone !== undefined) {
    const p = cleanPhone(body.phone);
    if (p === null) return fail(`Téléphone invalide (chiffres, espaces, + seulement ; ${PHONE_MAX} caractères au plus)`);
    phone = p || null;
  }
  const source = body.source as PriceSource | undefined;

  let list;
  switch (body.action) {
    case "create":
      if (name === undefined) return fail("Nom requis");
      await ensureOffsetsFrozen(); // anciens écarts figés avant d'ajouter un revendeur
      list = await createOption(name, city ?? null, source ?? "base", phone ?? null);
      break;
    case "update":
      if (!target) return fail("Revendeur inconnu");
      if (target.id === BASE_ID) return fail("« Prix Gros » est le tarif de base : il garde son nom.");
      list = await updateOption(target.id, { name, city, phone, source });
      break;
    case "delete":
      if (!target) return fail("Revendeur inconnu");
      if (target.id === BASE_ID) return fail("« Prix Gros » est le tarif de base : il ne peut pas être supprimé.");
      list = await deleteOption(target.id);
      break;
    case "reorder": {
      const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === "string") : null;
      const known = new Set(options.map((o) => o.id));
      if (!ids || ids.length > options.length || ids.some((id) => !known.has(id))) return fail("Ordre invalide");
      list = await reorderOptions(ids);
      break;
    }
    default:
      return fail("Action inconnue");
  }
  return NextResponse.json({ ok: true, options: list }, { headers: { "Cache-Control": "no-store" } });
}
