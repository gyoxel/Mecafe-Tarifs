"use client";

import { useEffect, useRef, useState } from "react";
import { CloseIcon, DownloadIcon, ShareIcon } from "./Icons";

/**
 * Aperçu d'un PDF dans la page, plein écran : pendant la préparation, une barre de progression ; ensuite les
 * pages, dessinées par pdf.js (les téléphones n'affichent pas tous un PDF dans la page). Chaque page est
 * transformée en image puis sa zone de dessin est libérée, pour ne pas saturer la mémoire d'un téléphone.
 */
export function PdfViewer({
  title,
  file,
  progress,
  onClose,
  onShare,
  onDownload,
}: {
  title: string;
  file: File | null;
  progress: number;
  onClose: () => void;
  onShare: () => void;
  onDownload: () => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState<{ ratio: number; src: string | null }[]>([]);
  const [failed, setFailed] = useState(false);

  // Échap ferme ; la page derrière ne défile pas.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  useEffect(() => {
    if (!file) return;
    let alive = true;
    const urls: string[] = [];
    let destroy: (() => void) | undefined;
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
          import.meta.url,
        ).toString();
        const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
        destroy = () => void task.destroy();
        const pdf = await task.promise;
        const sizes = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          const vp = (await pdf.getPage(i)).getViewport({ scale: 1 });
          sizes.push(vp.height / vp.width);
        }
        if (!alive) return;
        setPages(sizes.map((ratio) => ({ ratio, src: null })));
        const cssWidth = Math.min(scroller.current?.clientWidth ?? 800, 900);
        const px = Math.min(cssWidth * Math.min(window.devicePixelRatio || 1, 3), 2000); // net, même zoomé
        for (let i = 1; i <= pdf.numPages && alive; i++) {
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: px / page.getViewport({ scale: 1 }).width });
          const canvas = document.createElement("canvas");
          canvas.width = Math.round(viewport.width);
          canvas.height = Math.round(viewport.height);
          await page.render({ canvas, viewport }).promise;
          const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", 0.88));
          canvas.width = canvas.height = 0;
          page.cleanup();
          if (!blob || !alive) break;
          const url = URL.createObjectURL(blob);
          urls.push(url);
          setPages((cur) => cur.map((p, k) => (k === i - 1 ? { ...p, src: url } : p)));
        }
      } catch {
        if (alive) setFailed(true);
      }
    })();
    return () => {
      alive = false;
      destroy?.();
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [file]);

  const pct = Math.round(progress * 100);
  const loading = !file || (!pages.length && !failed);

  return (
    <div className="pdfv" role="dialog" aria-modal="true" aria-label={`Aperçu : ${title}`}>
      <div className="pdfv-top">
        <div className="pdfv-title">
          <strong>{title}</strong>
          {pages.length > 0 && (
            <span>
              {pages.length} page{pages.length > 1 ? "s" : ""}
            </span>
          )}
        </div>
        <div className="pdfv-tools">
          <button
            type="button"
            className="pdfv-btn"
            onClick={onShare}
            disabled={!file}
            aria-label="Partager le PDF"
            title="Partager"
          >
            <ShareIcon size={19} />
          </button>
          <button
            type="button"
            className="pdfv-btn"
            onClick={onDownload}
            disabled={!file}
            aria-label="Télécharger le PDF"
            title="Télécharger"
          >
            <DownloadIcon size={19} />
          </button>
          <button
            type="button"
            className="pdfv-btn pdfv-close"
            onClick={onClose}
            aria-label="Fermer l'aperçu"
            title="Fermer"
          >
            <CloseIcon size={17} />
          </button>
        </div>
      </div>

      <div className="pdfv-scroll" ref={scroller}>
        {loading && !failed && (
          <div className="pdfv-loading" role="status" aria-live="polite">
            <div
              className="pdfv-meter"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={file ? 100 : pct}
              aria-label="Préparation du PDF"
            >
              <span style={{ transform: `scaleX(${file ? 1 : progress})` }} />
            </div>
            <p>
              {file ? "Affichage…" : "Préparation du PDF…"} <strong>{file ? 100 : pct} %</strong>
            </p>
          </div>
        )}
        {failed && (
          <div className="pdfv-loading">
            <p>L&apos;aperçu n&apos;a pas pu s&apos;afficher sur cet appareil. Le PDF reste disponible :</p>
            <button type="button" className="btn btn-gold pdfv-fallback" onClick={onDownload}>
              <DownloadIcon size={17} /> Télécharger le PDF
            </button>
          </div>
        )}
        {pages.map((p, i) => (
          <div key={i} className="pdfv-page" style={{ aspectRatio: `1 / ${p.ratio}` }}>
            {p.src ? <img src={p.src} alt={`Page ${i + 1}`} /> : <span className="spinner" aria-hidden="true" />}
          </div>
        ))}
      </div>
    </div>
  );
}
