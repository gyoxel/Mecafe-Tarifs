import { redirect } from "next/navigation";
import { CommerciauxPanel } from "@/components/CommerciauxPanel";
import { GestionShell } from "@/components/GestionShell";
import { getAdminSession } from "@/lib/auth";
import { getOptions } from "@/lib/price-options";
import { storageMode } from "@/lib/prices";

export const metadata = { title: "Commerciaux et villes — Gestion — Mécafé Tarifs" };

export default async function GestionCommerciaux() {
  if (!(await getAdminSession())) redirect("/login");
  const options = await getOptions();
  return (
    <GestionShell active="commerciaux" storage={storageMode()}>
      <CommerciauxPanel options={options} />
    </GestionShell>
  );
}
