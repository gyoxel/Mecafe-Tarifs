import { NextResponse } from "next/server";
import { fold } from "@/lib/format";
import { requireAdmin, requireStorage } from "@/lib/guard";
import { BASE_ID, NAME_MAX, OFFSET_LIMIT } from "@/lib/options";
import { CITY_MAX, cityChoices, normalizeCity } from "@/lib/cities";
import { createOption, deleteOption, getOptions, reorderOptions, updateOption } from "@/lib/price-options";

/**
 * Gestion des revendeurs.
 * Corps : { action: "create", name, city?, offset } | { action: "update", id, name?, city?, offset? }
 *       | { action: "delete", id } | { action: "reorder", ids }   (city : texte, ou null / "" pour aucune ville)
 * La base (« Revendeur ») : seul son écart se modifie ; elle ne se supprime pas.
 * Réponse : la liste complète des revendeurs.
 */
type Body = { action?: unknown; id?: unknown; ids?: unknown; name?: unknown; city?: unknown; offset?: unknown };

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

  const name = typeof body.name === "string" ? body.name.trim().replace(/\s+/g, " ") : undefined;
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

  const offset = body.offset === undefined ? undefined : Number(body.offset);
  if (offset !== undefined && (!Number.isFinite(offset) || Math.abs(offset) > OFFSET_LIMIT)) {
    return fail("Écart invalide");
  }

  let list;
  switch (body.action) {
    case "create":
      if (name === undefined || offset === undefined) return fail("Nom et écart requis");
      list = await createOption(name, city ?? null, Math.round(offset * 100) / 100);
      break;
    case "update":
      if (!target) return fail("Revendeur inconnu");
      if (target.id === BASE_ID && (name !== undefined || city !== undefined)) {
        return fail("Le revendeur de base garde son nom : seul son écart se modifie.");
      }
      list = await updateOption(target.id, {
        name,
        city,
        offset: offset === undefined ? undefined : Math.round(offset * 100) / 100,
      });
      break;
    case "delete":
      if (!target) return fail("Revendeur inconnu");
      if (target.id === BASE_ID) return fail("Le revendeur de base ne peut pas être supprimé.");
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
