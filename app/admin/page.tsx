import { redirect } from "next/navigation";
import { Catalog } from "@/components/Catalog";
import { getAdminSession } from "@/lib/auth";
import { getCatalog } from "@/lib/catalog";
import { getPrices } from "@/lib/prices";
import { getOptions } from "@/lib/price-options";
import { getInvoice } from "@/lib/invoices";
import type { OptionPrices } from "@/lib/options";
import type { PriceMap } from "@/lib/types";
import { initialFilters } from "@/lib/url-filters";

export const metadata = { title: "Admin — Mécafé Tarifs" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Catalogue admin : choix du commercial, puis prix commerciaux (œil, clic sur le prix) et stock. */
export default async function AdminCatalog({ searchParams }: { searchParams: SearchParams }) {
  // Les prix commerciaux ne sont lus (et donc envoyés) qu'après vérification de la session admin.
  if (!(await getAdminSession())) redirect("/login");

  const [{ items, source, menu, order }, allPrices, options, sp] = await Promise.all([
    getCatalog(),
    getPrices(),
    getOptions(),
    searchParams,
  ]);
  const ids = new Set(items.map((i) => i.id));
  const keep = (m: PriceMap) => Object.fromEntries(Object.entries(m).filter(([id]) => ids.has(id)));
  // Prix saisis par commercial ; le prix automatique (prix site + écart) est calculé dans la page.
  const prices: OptionPrices = Object.fromEntries(options.map((o) => [o.id, keep(allPrices[o.id] ?? {})]));
  // « Modifier » depuis l'historique : /admin?modifier=<id>
  const editId = Number(Array.isArray(sp.modifier) ? sp.modifier[0] : sp.modifier);
  const edit = editId ? await getInvoice(editId) : null;

  return (
    <Catalog
      items={items}
      source={source}
      menu={menu}
      order={order}
      initial={initialFilters(sp)}
      admin={{ prices, options, choose: sp.choisir != null && !edit, edit }}
    />
  );
}
