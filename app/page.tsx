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

  const [{ items, source }, allPrices, sp] = await Promise.all([getCatalog(), getPrices(), searchParams]);

  const ids = new Set(items.map((i) => i.id));
  const prices = Object.fromEntries(Object.entries(allPrices).filter(([id]) => ids.has(id)));

  return (
    <Catalog
      items={items}
      prices={prices}
      source={source}
      isAdmin={session.role === "admin"}
      initial={{ q: first(sp.q), brand: first(sp.marque), category: first(sp.categorie) }}
    />
  );
}
