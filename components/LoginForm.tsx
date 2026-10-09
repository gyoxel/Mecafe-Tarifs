"use client";

import { useState } from "react";
import { LockIcon } from "./Icons";

export function LoginForm() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        // Rechargement complet (la session est lue côté serveur), puis choix du commercial.
        window.location.href = "/admin?choisir=1";
        return;
      }
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(data?.error ?? "Connexion impossible");
    } catch {
      setError("Erreur réseau, réessayez.");
    }
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="login-form">
      <label className="field">
        <span className="field-label">Code admin</span>
        <span className="field-control">
          <LockIcon size={18} />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
            autoFocus
            required
          />
        </span>
      </label>
      <p className="form-error" role="alert">
        {error}
      </p>
      <button type="submit" className="btn" disabled={busy || !password}>
        {busy ? "Vérification…" : "Entrer"}
      </button>
    </form>
  );
}
