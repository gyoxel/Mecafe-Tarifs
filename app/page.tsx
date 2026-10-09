import { Catalog } from "@/components/Catalog";
import { getCatalog } from "@/lib/catalog";
import { initialFilters } from "@/lib/url-filters";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * Catalogue public (commerciaux, sans mot de passe) : prix du site uniquement.
 * Aucun prix commercial, nom de commercial, ville ni stock n'est envoyé au navigateur.
 */
export default async function Home({ searchParams }: { searchParams: SearchParams }) {
  const [{ items, source, menu, order }, sp] = await Promise.all([getCatalog(), searchParams]);
  const publicItems = items.map(({ stock: _stock, ...rest }) => rest);

  return <Catalog items={publicItems} source={source} menu={menu} order={order} initial={initialFilters(sp)} />;
}
