import { redirect } from "next/navigation";
import { AdminPrices } from "@/components/AdminPrices";
import { getSession } from "@/lib/auth";
import { getCatalog } from "@/lib/catalog";
import { getPrices, storageMode } from "@/lib/prices";

export const metadata = { title: "Administration — Mécafé Tarifs" };

export default async function AdminPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "admin") redirect("/");

  const [{ items, source }, prices] = await Promise.all([getCatalog(), getPrices()]);
  const ids = new Set(items.map((i) => i.id));
  const orphans = Object.keys(prices).filter((id) => !ids.has(id)).length;

  return <AdminPrices items={items} prices={prices} source={source} storage={storageMode()} orphans={orphans} />;
}
