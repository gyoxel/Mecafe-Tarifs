import { redirect } from "next/navigation";
import { GestionShell } from "@/components/GestionShell";
import { PdfBuilder, type PdfBrand } from "@/components/PdfBuilder";
import { getAdminSession } from "@/lib/auth";
import { catalogueBrands } from "@/lib/catalogue-data";
import { storageMode } from "@/lib/prices";
import { getOptions } from "@/lib/price-options";
import { displayTitle, displayVariant } from "@/lib/title";

export const metadata = { title: "PDF — Gestion — Mécafé Tarifs" };

/** Catalogues PDF : type (prix public, tarifs d'un revendeur, à valider), puis marques / catégories / produits. */
export default async function GestionPdf() {
  if (!(await getAdminSession())) redirect("/login");

  const [{ brands }, options] = await Promise.all([catalogueBrands(), getOptions()]);
  // Arbre allégé pour la sélection : rien d'autre que ce que la liste affiche.
  const tree: PdfBrand[] = brands.map((b) => ({
    name: b.name,
    groups: b.groups.map((g, i) => ({
      key: `${b.name}:${i}`,
      title: g.title,
      crumb: g.crumb,
      items: g.items.map((it) => ({
        id: it.id,
        name: displayTitle(it.title, it.brand),
        variant: it.variant ? displayVariant(it.variant) : null,
        sku: it.sku,
        price: it.price,
      })),
    })),
  }));

  return (
    <GestionShell active="pdf" storage={storageMode()}>
      <PdfBuilder brands={tree} options={options} />
    </GestionShell>
  );
}
