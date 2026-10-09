import { LoginForm } from "@/components/LoginForm";
import Link from "next/link";

export const metadata = { title: "Admin — Mécafé Tarifs" };

/** Le code est demandé à chaque passage par le bouton « Admin », même si une session existe déjà. */
export default function LoginPage() {
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
