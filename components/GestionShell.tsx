import Link from "next/link";
import { DownloadIcon, FileTextIcon, LockIcon, TagIcon, UsersIcon } from "./Icons";

type Section = "commerciaux" | "prix" | "factures" | "pdf" | "codes";

/** `short` : libellé des onglets sur téléphone. */
const SECTIONS: { id: Section; href: string; label: string; short: string; hint: string; Icon: typeof TagIcon }[] = [
  {
    id: "commerciaux",
    href: "/admin/gestion",
    label: "Revendeurs et villes",
    short: "Revendeurs",
    hint: "Noms, villes, écarts",
    Icon: UsersIcon,
  },
  { id: "prix", href: "/admin/gestion/prix", label: "Prix des produits", short: "Prix", hint: "Par revendeur", Icon: TagIcon },
  { id: "factures", href: "/admin/gestion/factures", label: "Devis", short: "Devis", hint: "Historique", Icon: FileTextIcon },
  { id: "pdf", href: "/admin/gestion/pdf", label: "PDF", short: "PDF", hint: "Catalogues à télécharger", Icon: DownloadIcon },
  { id: "codes", href: "/admin/gestion/codes", label: "Codes d'accès", short: "Codes", hint: "Clients et admin", Icon: LockIcon },
];

/** Cadre des pages Gestion : en-tête + barre latérale (onglets en haut sur mobile). */
export function GestionShell({
  active,
  storage,
  children,
}: {
  active: Section;
  /** down = production sans base : enregistrements refusés. */
  storage: "postgres" | "memory" | "down";
  children: React.ReactNode;
}) {
  return (
    <div className="admin">
      <header className="admin-head">
        <div>
          <Link href="/admin" className="admin-logo" aria-label="Retour au catalogue admin">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/mecafe-logo-sm.png" alt="Mécafé" width={480} height={156} />
          </Link>
          <h1 className="admin-title">Gestion</h1>
        </div>
        <Link href="/admin" className="btn btn-ghost">
          ← Catalogue
        </Link>
      </header>

      {storage === "down" ? (
        <p className="notice warn storage-down" role="alert">
          <strong>Base de données non connectée.</strong> Rien ne peut être enregistré (devis, prix, revendeurs) tant
          qu&apos;elle n&apos;est pas rétablie : vérifiez DATABASE_URL dans Vercel (Settings → Environment Variables).
        </p>
      ) : (
        storage === "memory" && (
          <p className="notice warn">
            Base de données non connectée : les modifications sont <strong>temporaires</strong> (mode démo local).
            Définissez DATABASE_URL pour les conserver.
          </p>
        )
      )}

      <div className="gestion">
        <nav className="gestion-nav" aria-label="Gestion">
          {SECTIONS.map(({ id, href, label, short, hint, Icon }) => (
            <Link key={id} href={href} className="gestion-link" aria-current={active === id ? "page" : undefined}>
              <Icon size={18} />
              <span>
                <span className="gestion-link-label">{label}</span>
                <span className="gestion-link-short">{short}</span>
                <span className="gestion-link-hint">{hint}</span>
              </span>
            </Link>
          ))}
        </nav>
        <div className="gestion-main">{children}</div>
      </div>
    </div>
  );
}
