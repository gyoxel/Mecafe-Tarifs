/**
 * Fait défiler `container` juste assez pour montrer `el`, sans faire défiler la page
 * (contrairement à scrollIntoView, qui déplace aussi la fenêtre).
 */
export function keepVisible(container: HTMLElement | null, el: HTMLElement | null | undefined) {
  if (!container || !el) return;
  const c = container.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  if (r.top < c.top) container.scrollTop -= c.top - r.top;
  else if (r.bottom > c.bottom) container.scrollTop += r.bottom - c.bottom;
}

/* ─────────────── Page figée sous une fenêtre ─────────────── */

let locks = 0;
let saved: { y: number; css: string } | null = null;

/**
 * Fige la page derrière une fenêtre (panier, facture, choix du commercial) : ni la molette, ni le pavé
 * tactile, ni le doigt ne la font bouger, sans rebond. La page est « épinglée » à sa position puis
 * rendue au même endroit à la fermeture. Plusieurs fenêtres peuvent s'empiler.
 */
export function lockScroll(): () => void {
  if (locks++ === 0) {
    const y = window.scrollY;
    const body = document.body;
    saved = { y, css: body.style.cssText };
    Object.assign(body.style, { position: "fixed", top: `-${y}px`, left: "0", right: "0", width: "100%" });
    document.documentElement.classList.add("scroll-locked");
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--locks === 0 && saved) {
      document.body.style.cssText = saved.css;
      document.documentElement.classList.remove("scroll-locked");
      window.scrollTo({ top: saved.y, behavior: "instant" as ScrollBehavior });
      saved = null;
    }
  };
}
