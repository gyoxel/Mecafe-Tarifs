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
