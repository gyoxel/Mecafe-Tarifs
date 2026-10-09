import { redirect } from "next/navigation";
import { Catalog } from "@/components/Catalog";
import { getSession } from "@/lib/auth";
import { getCatalog } from "@/lib/catalog";
import { getPrices } from "@/lib/prices";
import type { OptionPrices } from "@/lib/options";
import type { PriceMap } from "@/lib/types";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function Home({ searchParams }: { searchParams: SearchParams }) {
  // Les prix commerciaux ne sont lus (et donc envoyés) qu'après vérification de la session.
  const session = await getSession();
  if (!session) redirect("/login");

  const [{ items, source, menu, order }, allPrices, sp] = await Promise.all([getCatalog(), getPrices(), searchParams]);

  const isAdmin = session.role === "admin";
  const ids = new Set(items.map((i) => i.id));
  const keep = (m: PriceMap) => Object.fromEntries(Object.entries(m).filter(([id]) => ids.has(id)));
  // Prix saisis par option ; le prix automatique (prix site + écart) est calculé dans la page.
  const prices: OptionPrices = {
    a: keep(allPrices.a),
    b: keep(allPrices.b),
    c: keep(allPrices.c),
    autre: keep(allPrices.autre),
  };
  // Le stock n'est envoyé qu'à l'administrateur (jamais présent dans la page d'un commercial).
  const visibleItems = isAdmin ? items : items.map(({ stock: _stock, ...rest }) => rest);

  return (
    <Catalog
      items={visibleItems}
      prices={prices}
      source={source}
      menu={menu}
      order={order}
      isAdmin={isAdmin}
      initial={{
        q: first(sp.q),
        brand: first(sp.marque),
        path: [...first(sp.categorie).split("/"), first(sp.sous)].filter(Boolean),
      }}
    />
  );
}
