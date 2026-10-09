import { redirect } from "next/navigation";
import { AdminPrices } from "@/components/AdminPrices";
import { getSession } from "@/lib/auth";
import { getCatalog } from "@/lib/catalog";
import { getPrices, storageMode } from "@/lib/prices";
import { getOptions } from "@/lib/price-options";

export const metadata = { title: "Administration — Mécafé Tarifs" };

export default async function AdminPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "admin") redirect("/");

  const [{ items, source }, prices, options] = await Promise.all([getCatalog(), getPrices(), getOptions()]);
  const ids = new Set(items.map((i) => i.id));
  const orphans = options
    .flatMap((o) => Object.keys(prices[o.id] ?? {}))
    .filter((id) => !ids.has(id)).length;

  return <AdminPrices items={items} prices={prices} options={options} source={source} storage={storageMode()} orphans={orphans} />;
}
