import { redirect } from "next/navigation";
import { LoginForm } from "@/components/LoginForm";
import { getSession } from "@/lib/auth";

export const metadata = { title: "Connexion — Mécafé Tarifs" };

export default async function LoginPage() {
  if (await getSession()) redirect("/");
  return (
    <main className="center-screen">
      <div className="panel">
        <h1 className="wordmark">MÉCAFÉ</h1>
        <p className="tagline">Tarifs professionnels</p>
        <p className="panel-text">Accès réservé à l&apos;équipe commerciale.</p>
        <LoginForm />
      </div>
    </main>
  );
}
