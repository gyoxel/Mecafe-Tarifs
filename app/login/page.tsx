import { redirect } from "next/navigation";
import { LoginForm } from "@/components/LoginForm";
import { getSession } from "@/lib/auth";

export const metadata = { title: "Connexion — Mécafé Tarifs" };

export default async function LoginPage() {
  if (await getSession()) redirect("/");
  return (
    <main className="center-screen">
      <div className="login-card">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="login-logo" src="/mecafe-logo.png" alt="Mécafé 1988" width={1126} height={366} />
        <h1>Tarifs professionnels</h1>
        <p className="muted">Accès réservé à l&apos;équipe commerciale.</p>
        <LoginForm />
      </div>
    </main>
  );
}
