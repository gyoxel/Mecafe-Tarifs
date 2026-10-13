import { redirect } from "next/navigation";
import { CommerciauxPanel } from "@/components/CommerciauxPanel";
import { GestionShell } from "@/components/GestionShell";
import { getAdminSession } from "@/lib/auth";
import { getOptions } from "@/lib/price-options";
import { baseChanges, storageMode } from "@/lib/prices";

export const metadata = { title: "Revendeurs et villes — Gestion — Mécafé Tarifs" };

export default async function GestionCommerciaux() {
  if (!(await getAdminSession())) redirect("/login?admin=1");
  const [options, all] = await Promise.all([getOptions(), baseChanges()]);
  const changes = Object.fromEntries(Object.entries(all).map(([id, m]) => [id, Object.keys(m).length]));
  return (
    <GestionShell active="commerciaux" storage={storageMode()}>
      <CommerciauxPanel options={options} changes={changes} />
    </GestionShell>
  );
}
