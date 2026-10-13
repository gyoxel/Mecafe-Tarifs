"use client";

import { useState } from "react";
import { EyeIcon, LockIcon, UsersIcon } from "./Icons";

type Role = "client" | "admin";
type Info = Record<Role, { source: "gestion" | "vercel" | "aucun"; updatedAt: string | null }>;

const when = (iso: string) =>
  new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Africa/Casablanca",
  }).format(new Date(iso));

function status(i: Info[Role]): string {
  if (i.source === "gestion" && i.updatedAt) return `Modifié ici le ${when(i.updatedAt)}`;
  if (i.source === "vercel") return "Défini dans Vercel (pas encore modifié ici)";
  return "Aucun code défini";
}

/** Champ de code masqué, avec un œil pour l'afficher. */
function CodeField({
  label,
  value,
  onChange,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
}) {
  const [shown, setShown] = useState(false);
  return (
    <label className="field codes-field">
      <span className="field-label">{label}</span>
      <span className="field-control">
        <LockIcon size={17} />
        <input
          type={shown ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          spellCheck={false}
          autoCapitalize="off"
        />
        <button
          type="button"
          className="codes-eye"
          onClick={() => setShown((s) => !s)}
          aria-label={shown ? "Masquer le code" : "Afficher le code"}
          aria-pressed={shown}
        >
          <EyeIcon size={17} off={!shown} />
        </button>
      </span>
    </label>
  );
}

function CodeCard({
  target,
  info,
  min,
  onSaved,
}: {
  target: Role;
  info: Info[Role];
  min: number;
  onSaved: (info: Info) => void;
}) {
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [current, setCurrent] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const problem =
    next && next.length < min
      ? `Au moins ${min} caractères.`
      : confirm && confirm !== next
        ? "Les deux codes ne sont pas identiques."
        : null;
  const isAdmin = target === "admin";
  const ready = next.length >= min && confirm === next && (!isAdmin || current !== "") && !busy;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target, next, current: isAdmin ? current : undefined }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; info?: Info };
      if (!res.ok || !data.info) throw new Error(data.error ?? `Erreur ${res.status}`);
      onSaved(data.info);
      setNext("");
      setConfirm("");
      setCurrent("");
      setMsg({
        kind: "ok",
        text:
          target === "client"
            ? "Code clients changé. Les clients connectés avec l'ancien code devront entrer le nouveau."
            : "Code admin changé. Les autres appareils connectés en admin sont déconnectés ; vous restez connecté ici.",
      });
    } catch (err) {
      setMsg({ kind: "error", text: err instanceof Error ? err.message : "Échec" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="codes-card" onSubmit={submit}>
      <div className="codes-head">
        <span className="codes-icon">{isAdmin ? <LockIcon size={18} /> : <UsersIcon size={18} />}</span>
        <div>
          <h3>{isAdmin ? "Code admin" : "Code clients"}</h3>
          <p className="muted small">
            {isAdmin
              ? "Ouvre l'espace admin : prix revendeurs, panier, devis, Gestion."
              : "À donner aux clients : catalogue au prix public seulement."}
          </p>
          <p className="codes-status">{status(info)}</p>
        </div>
      </div>
      <CodeField label="Nouveau code" value={next} onChange={setNext} autoComplete="new-password" />
      <CodeField label="Confirmer le nouveau code" value={confirm} onChange={setConfirm} autoComplete="new-password" />
      {isAdmin && (
        <CodeField label="Code admin actuel" value={current} onChange={setCurrent} autoComplete="current-password" />
      )}
      {problem && <p className="codes-msg error">{problem}</p>}
      {msg && (
        <p className={`codes-msg ${msg.kind}`} role={msg.kind === "error" ? "alert" : "status"}>
          {msg.text}
        </p>
      )}
      <button type="submit" className="btn btn-gold codes-submit" disabled={!ready}>
        {busy ? "Enregistrement…" : isAdmin ? "Changer le code admin" : "Changer le code clients"}
      </button>
    </form>
  );
}

/**
 * Gestion › Codes d'accès : code clients (catalogue au prix public) et code admin. Le code admin actuel n'est
 * demandé que pour changer le code admin.
 */
export function CodesPanel({ info: initial, min }: { info: Info; min: Record<Role, number> }) {
  const [info, setInfo] = useState(initial);
  return (
    <section className="admin-options codes">
      <h2 className="admin-section-title">Codes d&apos;accès</h2>
      <p className="muted small admin-options-hint">
        Le site demande un code à l&apos;entrée. Le code clients ouvre le catalogue au prix public ; le code admin
        ouvre l&apos;espace admin (son code actuel est demandé pour le changer). Changer un code déconnecte les
        personnes connectées avec l&apos;ancien.
      </p>
      <div className="codes-grid">
        <CodeCard target="client" info={info.client} min={min.client} onSaved={setInfo} />
        <CodeCard target="admin" info={info.admin} min={min.admin} onSaved={setInfo} />
      </div>
    </section>
  );
}
