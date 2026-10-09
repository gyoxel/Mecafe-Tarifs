import { brandLogo } from "@/lib/brands";

/** Pastille ronde d'une marque : logo si disponible, sinon son nom en typographie. */
export function BrandBadge({ brand, className = "" }: { brand: string; className?: string }) {
  const logo = brandLogo(brand);
  return (
    <span className={`brand-badge ${className}`} aria-hidden="true">
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo.src} alt="" width={logo.width} height={logo.height} loading="lazy" decoding="async" />
      ) : (
        <span className="brand-badge-name">{brand}</span>
      )}
    </span>
  );
}
