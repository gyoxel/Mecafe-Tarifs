import { redirect } from "next/navigation";
import { CodesPanel } from "@/components/CodesPanel";
import { GestionShell } from "@/components/GestionShell";
import { getAdminSession } from "@/lib/auth";
import { CODE_MIN, codesInfo } from "@/lib/credentials";
import { storageMode } from "@/lib/prices";

export const metadata = { title: "Codes d'accès — Gestion — Mécafé Tarifs" };

export default async function GestionCodes() {
  if (!(await getAdminSession())) redirect("/login?admin=1");
  return (
    <GestionShell active="codes" storage={storageMode()}>
      <CodesPanel info={await codesInfo()} min={CODE_MIN} />
    </GestionShell>
  );
}
