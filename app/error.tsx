"use client";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="center-screen">
      <div className="panel">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/mecafe-logo-sm.png" alt="Mécafé" width={480} height={156} />
        <p className="panel-text">Impossible de charger le catalogue pour le moment.</p>
        {process.env.NODE_ENV !== "production" && <pre className="panel-error">{error.message}</pre>}
        <button type="button" className="btn" onClick={reset}>
          Réessayer
        </button>
      </div>
    </main>
  );
}
