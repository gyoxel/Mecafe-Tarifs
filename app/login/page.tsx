import { redirect } from "next/navigation";
import { LoginForm } from "@/components/LoginForm";
import Link from "next/link";
import { getAdminSession } from "@/lib/auth";

export const metadata = { title: "Admin — Mécafé Tarifs" };

export default async function LoginPage() {
  if (await getAdminSession()) redirect("/admin");
  return (
    <main className="center-screen">
      <div className="login-card">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="login-logo" src="/mecafe-logo.png" alt="Mécafé 1988" width={1126} height={366} />
        <h1>Espace admin</h1>
        <p className="muted">Entrez le code admin pour afficher les prix commerciaux.</p>
        <LoginForm />
        <Link href="/" className="login-back">
          ← Retour au catalogue
        </Link>
      </div>
    </main>
  );
}
