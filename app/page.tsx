import { redirect } from "next/navigation";
import { Catalog } from "@/components/Catalog";
import { getSession } from "@/lib/auth";
import { getCatalog } from "@/lib/catalog";
import { getPrices } from "@/lib/prices";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function Home({ searchParams }: { searchParams: SearchParams }) {
  // Les prix commerciaux ne sont lus (et donc envoyés) qu'après vérification de la session.
  const session = await getSession();
  if (!session) redirect("/login");

  const [{ items, source, menu }, allPrices, sp] = await Promise.all([getCatalog(), getPrices(), searchParams]);

  const isAdmin = session.role === "admin";
  const ids = new Set(items.map((i) => i.id));
  const prices = Object.fromEntries(Object.entries(allPrices).filter(([id]) => ids.has(id)));
  // Le stock n'est envoyé qu'à l'administrateur (jamais présent dans la page d'un commercial).
  const visibleItems = isAdmin ? items : items.map(({ stock: _stock, ...rest }) => rest);

  return (
    <Catalog
      items={visibleItems}
      prices={prices}
      source={source}
      menu={menu}
      isAdmin={isAdmin}
      initial={{
        q: first(sp.q),
        brand: first(sp.marque),
        path: [...first(sp.categorie).split("/"), first(sp.sous)].filter(Boolean),
      }}
    />
  );
}
