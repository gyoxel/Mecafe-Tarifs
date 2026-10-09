import { redirect } from "next/navigation";
import { AdminPrices } from "@/components/AdminPrices";
import { GestionShell } from "@/components/GestionShell";
import { getAdminSession } from "@/lib/auth";
import { getCatalog } from "@/lib/catalog";
import { getPrices, storageMode } from "@/lib/prices";
import { getOptions } from "@/lib/price-options";

export const metadata = { title: "Prix des produits — Gestion — Mécafé Tarifs" };

export default async function GestionPrix() {
  if (!(await getAdminSession())) redirect("/login");

  const [{ items, source }, prices, options] = await Promise.all([getCatalog(), getPrices(), getOptions()]);
  const ids = new Set(items.map((i) => i.id));
  const orphans = options
    .flatMap((o) => Object.keys(prices[o.id] ?? {}))
    .filter((id) => !ids.has(id)).length;

  return (
    <GestionShell active="prix" storage={storageMode()}>
      <AdminPrices items={items} prices={prices} options={options} source={source} orphans={orphans} />
    </GestionShell>
  );
}
