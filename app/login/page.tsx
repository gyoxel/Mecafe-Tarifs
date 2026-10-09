import { redirect } from "next/navigation";
import { BrandBadge } from "@/components/BrandLogo";
import { LoginForm } from "@/components/LoginForm";
import { getSession } from "@/lib/auth";
import { BRAND_ORDER } from "@/lib/config";

export const metadata = { title: "Connexion — Mécafé Tarifs" };

export default async function LoginPage() {
  if (await getSession()) redirect("/");
  return (
    <main className="login">
      <section className="login-visual">
        <div className="login-visual-inner">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="login-logo" src="/mecafe-logo.png" alt="Mécafé 1988" width={1126} height={366} />
          <div>
            <p className="eyebrow">Tarifs professionnels</p>
          </div>
          <div className="login-brands" aria-hidden="true">
            {BRAND_ORDER.map((b) => (
              <BrandBadge key={b} brand={b} />
            ))}
          </div>
        </div>
      </section>
      <section className="login-panel">
        <div className="login-card">
          <h1>Connexion</h1>
          <p className="muted">Accès réservé à l&apos;équipe commerciale Mécafé.</p>
          <LoginForm />
        </div>
      </section>
    </main>
  );
}
