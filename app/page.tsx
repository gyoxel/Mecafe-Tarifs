import { redirect } from "next/navigation";
import { Catalog } from "@/components/Catalog";
import { getSession } from "@/lib/auth";
import { getCatalog } from "@/lib/catalog";
import { initialFilters } from "@/lib/url-filters";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * Catalogue clients (code clients, ou admin) : prix public uniquement.
 * Aucun prix revendeur, nom de revendeur, ville ni stock n'est envoyé au navigateur.
 */
export default async function Home({ searchParams }: { searchParams: SearchParams }) {
  if (!(await getSession())) redirect("/login");
  const [{ items, source, menu, order }, sp] = await Promise.all([getCatalog(), searchParams]);
  const publicItems = items.map(({ stock: _stock, ...rest }) => rest);

  return <Catalog items={publicItems} source={source} menu={menu} order={order} initial={initialFilters(sp)} />;
}
