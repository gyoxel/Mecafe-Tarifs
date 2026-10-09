import Link from "next/link";
import { TagIcon, UsersIcon } from "./Icons";

type Section = "commerciaux" | "prix";

const SECTIONS: { id: Section; href: string; label: string; hint: string; Icon: typeof TagIcon }[] = [
  { id: "commerciaux", href: "/admin/gestion", label: "Commerciaux et villes", hint: "Noms, villes, écarts", Icon: UsersIcon },
  { id: "prix", href: "/admin/gestion/prix", label: "Prix des produits", hint: "Par commercial", Icon: TagIcon },
];

/** Cadre des pages Gestion : en-tête + barre latérale (onglets en haut sur mobile). */
export function GestionShell({
  active,
  storage,
  children,
}: {
  active: Section;
  storage: "postgres" | "memory";
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

      {storage === "memory" && (
        <p className="notice warn">
          Base de données non connectée : les modifications sont <strong>temporaires</strong> (mode démo). Définissez
          DATABASE_URL pour les conserver.
        </p>
      )}

      <div className="gestion">
        <nav className="gestion-nav" aria-label="Gestion">
          {SECTIONS.map(({ id, href, label, hint, Icon }) => (
            <Link key={id} href={href} className="gestion-link" aria-current={active === id ? "page" : undefined}>
              <Icon size={18} />
              <span>
                <span className="gestion-link-label">{label}</span>
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
