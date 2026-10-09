"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { fold, formatDH } from "@/lib/format";
import { parsePrice } from "@/lib/csv";
import { haystackOf, matchesAll, tokensOf } from "@/lib/search";
import type { CatalogItem, CatalogSource, PriceMap } from "@/lib/types";

type Props = {
  items: CatalogItem[];
  prices: PriceMap;
  source: CatalogSource;
  storage: "postgres" | "memory";
  orphans: number;
};

const ROWS_STEP = 150;
const asText = (n: number | undefined) => (n == null ? "" : String(n).replace(".", ","));

export function AdminPrices({ items, prices, source, storage, orphans }: Props) {
  const [saved, setSaved] = useState<PriceMap>(prices);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  const [brand, setBrand] = useState("");
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [rows, setRows] = useState(ROWS_STEP);
  const [status, setStatus] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const brands = useMemo(() => [...new Set(items.map((i) => i.brand))], [items]);
  const haystacks = useMemo(() => items.map(haystackOf), [items]);

  const filtered = useMemo(() => {
    const tokens = tokensOf(query);
    return items.filter(
      (it, i) =>
        (!brand || it.brand === brand) &&
        (!onlyMissing || saved[it.id] == null) &&
        (!tokens.length || matchesAll(haystacks[i], tokens)),
    );
  }, [items, haystacks, query, brand, onlyMissing, saved]);

  // Brouillons réellement modifiés par rapport à la valeur enregistrée.
  const dirty = useMemo(
    () => Object.entries(drafts).filter(([id, text]) => text.trim() !== asText(saved[id])),
    [drafts, saved],
  );
  const invalid = useMemo(() => new Set(dirty.filter(([, t]) => Number.isNaN(parsePrice(t))).map(([id]) => id)), [dirty]);

  useEffect(() => {
    if (!dirty.length) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty.length]);

  async function post(url: string, body?: unknown) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : `Erreur ${res.status}`);
    return data;
  }

  async function save() {
    if (!dirty.length || invalid.size || busy) return;
    setBusy(true);
    setStatus(null);
    try {
      const updates = dirty.map(([variantId, text]) => ({ variantId, price: parsePrice(text) }));
      await post("/api/admin/prices", { updates });
      setSaved((prev) => {
        const next = { ...prev };
        for (const u of updates) {
          if (u.price == null) delete next[u.variantId];
          else next[u.variantId] = u.price;
        }
        return next;
      });
      setDrafts({});
      setStatus({ kind: "ok", text: `${updates.length} prix enregistré${updates.length > 1 ? "s" : ""}.` });
    } catch (e) {
      setStatus({ kind: "error", text: e instanceof Error ? e.message : "Échec de l'enregistrement" });
    }
    setBusy(false);
  }

  async function importCsv(file: File) {
    setBusy(true);
    setStatus(null);
    try {
      const data = await post("/api/admin/import", { csv: await file.text() });
      const lines = (k: string) => (Array.isArray(data[k]) ? (data[k] as number[]) : []);
      const problems = [
        lines("unmatchedLines").length && `lignes non reconnues : ${lines("unmatchedLines").join(", ")}`,
        lines("invalidLines").length && `prix invalides : lignes ${lines("invalidLines").join(", ")}`,
      ].filter(Boolean);
      setStatus({
        kind: problems.length ? "error" : "ok",
        text: `Import terminé : ${data.updated} modifié(s), ${data.unchanged} inchangé(s)${problems.length ? " — " + problems.join(" ; ") : "."}`,
      });
      setTimeout(() => window.location.reload(), problems.length ? 4000 : 1200);
    } catch (e) {
      setStatus({ kind: "error", text: e instanceof Error ? e.message : "Échec de l'import" });
    }
    setBusy(false);
    if (fileInput.current) fileInput.current.value = "";
  }

  async function refreshShopify() {
    setBusy(true);
    try {
      await post("/api/admin/refresh");
      window.location.reload();
    } catch (e) {
      setStatus({ kind: "error", text: e instanceof Error ? e.message : "Échec du rafraîchissement" });
      setBusy(false);
    }
  }

  return (
    <div className="admin">
      <header className="admin-head">
        <div>
          <h1 className="wordmark small">MÉCAFÉ</h1>
          <p className="tagline">Administration — prix commerciaux</p>
        </div>
        <Link href="/" className="btn btn-ghost">
          ← Catalogue
        </Link>
      </header>

      {storage === "memory" && (
        <p className="notice warn">
          Base de données non connectée : les modifications sont <strong>temporaires</strong> (mode démo). Définissez
          DATABASE_URL pour les conserver.
        </p>
      )}
      {source === "demo" && <p className="notice">Catalogue de démonstration (Shopify non connecté).</p>}
      {orphans > 0 && (
        <p className="notice">
          {orphans} prix enregistré{orphans > 1 ? "s" : ""} ne correspond{orphans > 1 ? "ent" : ""} plus à un produit
          Shopify (produit supprimé ou format modifié).
        </p>
      )}

      <div className="admin-tools">
        <input
          type="search"
          className="admin-input grow"
          placeholder="Rechercher…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setRows(ROWS_STEP);
          }}
        />
        <select
          className="admin-input"
          value={brand}
          onChange={(e) => {
            setBrand(e.target.value);
            setRows(ROWS_STEP);
          }}
          aria-label="Marque"
        >
          <option value="">Toutes les marques</option>
          {brands.map((b) => (
            <option key={fold(b)} value={b}>
              {b}
            </option>
          ))}
        </select>
        <label className="check">
          <input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} />
          Sans prix commercial
        </label>
      </div>

      <div className="admin-tools">
        <a className="btn btn-ghost" href="/api/admin/export">
          Exporter CSV
        </a>
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => fileInput.current?.click()}>
          Importer CSV
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".csv,text/csv"
          hidden
          onChange={(e) => e.target.files?.[0] && importCsv(e.target.files[0])}
        />
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={refreshShopify}>
          Rafraîchir depuis Shopify
        </button>
        <span className="muted">{filtered.length} ligne(s)</span>
      </div>

      {status && (
        <p className={`notice ${status.kind === "error" ? "warn" : "ok"}`} role="status">
          {status.text}
        </p>
      )}

      <div className="table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Produit</th>
              <th className="hide-sm">SKU</th>
              <th className="num">Prix site</th>
              <th className="num">Prix commercial (DH)</th>
              <th className="num hide-sm">Écart</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, rows).map((it) => {
              const draft = drafts[it.id];
              const value = draft ?? asText(saved[it.id]);
              const parsed = parsePrice(value);
              const gap = typeof parsed === "number" && !Number.isNaN(parsed) ? parsed - it.price : null;
              const changed = draft !== undefined && draft.trim() !== asText(saved[it.id]);
              return (
                <tr key={it.id} data-changed={changed}>
                  <td>
                    <div className="cell-title">{it.title}</div>
                    <div className="muted small">
                      {it.brand}
                      {it.variant ? ` · ${it.variant}` : ""}
                    </div>
                  </td>
                  <td className="hide-sm muted small">{it.sku ?? "—"}</td>
                  <td className="num">{formatDH(it.price)}</td>
                  <td className="num">
                    <input
                      className="admin-input price-input"
                      inputMode="decimal"
                      value={value}
                      placeholder="—"
                      aria-label={`Prix commercial : ${it.title}${it.variant ? " " + it.variant : ""}`}
                      aria-invalid={invalid.has(it.id)}
                      onChange={(e) => setDrafts((d) => ({ ...d, [it.id]: e.target.value }))}
                    />
                  </td>
                  <td className="num hide-sm muted small">
                    {gap == null ? "" : `${gap > 0 ? "+" : gap < 0 ? "−" : ""}${formatDH(Math.abs(gap))}`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length > rows && (
          <button type="button" className="btn btn-ghost more" onClick={() => setRows((r) => r + ROWS_STEP)}>
            Afficher plus ({filtered.length - rows} restantes)
          </button>
        )}
      </div>

      {dirty.length > 0 && (
        <div className="save-bar" role="region" aria-label="Modifications en attente">
          <span>
            {dirty.length} modification{dirty.length > 1 ? "s" : ""} non enregistrée{dirty.length > 1 ? "s" : ""}
            {invalid.size > 0 && <strong className="err"> · {invalid.size} prix invalide(s)</strong>}
          </span>
          <span className="save-actions">
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setDrafts({})}>
              Annuler
            </button>
            <button type="button" className="btn" disabled={busy || invalid.size > 0} onClick={save}>
              {busy ? "Enregistrement…" : "Enregistrer"}
            </button>
          </span>
        </div>
      )}
    </div>
  );
}
