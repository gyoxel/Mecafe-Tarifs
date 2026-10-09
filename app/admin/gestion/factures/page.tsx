import { redirect } from "next/navigation";
import { FacturesPanel } from "@/components/FacturesPanel";
import { GestionShell } from "@/components/GestionShell";
import { getAdminSession } from "@/lib/auth";
import { listInvoices } from "@/lib/invoices";
import { storageMode } from "@/lib/prices";

export const metadata = { title: "Factures — Gestion — Mécafé Tarifs" };

export default async function GestionFactures() {
  if (!(await getAdminSession())) redirect("/login");
  const invoices = await listInvoices();
  return (
    <GestionShell active="factures" storage={storageMode()}>
      <FacturesPanel invoices={invoices} />
    </GestionShell>
  );
}
