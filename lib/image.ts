/** Redimensionne via le CDN Shopify (paramètre `width`) ; les autres URLs sont laissées telles quelles. */
export function sizedImage(url: string, width: number): string {
  try {
    const u = new URL(url);
    if (!u.hostname.endsWith("shopify.com") && !u.hostname.endsWith("shopifycdn.com")) return url;
    u.searchParams.set("width", String(width));
    return u.toString();
  } catch {
    return url;
  }
}
