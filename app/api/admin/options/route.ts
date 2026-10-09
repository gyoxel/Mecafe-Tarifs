import { NextResponse } from "next/server";
import { fold } from "@/lib/format";
import { requireAdmin } from "@/lib/guard";
import { NAME_MAX, OFFSET_LIMIT } from "@/lib/options";
import { createOption, deleteOption, getOptions, updateOption } from "@/lib/price-options";

/**
 * Gestion des options de prix (page de modification).
 * Corps : { action: "create", name, offset } | { action: "update", id, name?, offset?, isDefault? } | { action: "delete", id }
 * Réponse : la liste complète des options.
 */
type Body = { action?: unknown; id?: unknown; name?: unknown; offset?: unknown; isDefault?: unknown };

const fail = (error: string) => NextResponse.json({ error }, { status: 400 });

export async function POST(req: Request) {
  const denied = await requireAdmin(req, { write: true });
  if (denied) return denied;

  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body) return fail("Requête invalide");
  const options = await getOptions();
  const target = typeof body.id === "string" ? options.find((o) => o.id === body.id) : undefined;

  const name = typeof body.name === "string" ? body.name.trim().replace(/\s+/g, " ") : undefined;
  if (name !== undefined) {
    if (!name || name.length > NAME_MAX) return fail(`Nom requis (${NAME_MAX} caractères au plus)`);
    if (options.some((o) => o.id !== target?.id && fold(o.name) === fold(name))) {
      return fail(`L'option « ${name} » existe déjà`);
    }
  }
  const offset = body.offset === undefined ? undefined : Number(body.offset);
  if (offset !== undefined && (!Number.isFinite(offset) || Math.abs(offset) > OFFSET_LIMIT)) {
    return fail("Écart invalide");
  }

  let list;
  switch (body.action) {
    case "create":
      if (name === undefined || offset === undefined) return fail("Nom et écart requis");
      list = await createOption(name, Math.round(offset * 100) / 100);
      break;
    case "update":
      if (!target) return fail("Option inconnue");
      list = await updateOption(target.id, {
        name,
        offset: offset === undefined ? undefined : Math.round(offset * 100) / 100,
        isDefault: body.isDefault === true ? true : undefined,
      });
      break;
    case "delete":
      if (!target) return fail("Option inconnue");
      if (options.length <= 1) return fail("Il faut garder au moins une option");
      list = await deleteOption(target.id);
      break;
    default:
      return fail("Action inconnue");
  }
  return NextResponse.json({ ok: true, options: list }, { headers: { "Cache-Control": "no-store" } });
}
