import Link from "next/link";
import { redirect } from "next/navigation";
import { LoginBackdrop } from "@/components/LoginBackdrop";
import { LoginForm } from "@/components/LoginForm";
import { getSession } from "@/lib/auth";

export const metadata = { title: "Connexion — Mécafé Tarifs" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * Porte d'entrée du site : code clients (catalogue au prix public) ou code admin.
 * `?admin=1` (bouton « Admin ») : espace admin, le code admin est demandé à chaque passage même si une session
 * existe déjà.
 */
export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const admin = (await searchParams).admin === "1";
  if (!admin) {
    const session = await getSession();
    if (session) redirect(session.role === "admin" ? "/admin" : "/");
  }
  return (
    <main className="center-screen login-screen">
      <LoginBackdrop />
      <div className="login-card">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="login-logo" src="/mecafe-logo.png" alt="Mécafé 1988" width={1126} height={366} />
        <h1>{admin ? "Espace admin" : "Tarifs professionnels"}</h1>
        <p className="muted">
          {admin ? "Entrez le code admin pour afficher les prix revendeurs." : "Entrez votre code d'accès."}
        </p>
        <LoginForm admin={admin} />
        {admin && (
          <Link href="/" className="login-back">
            ← Retour au catalogue
          </Link>
        )}
      </div>
    </main>
  );
}
