import { brandStyle } from "@/lib/brands";

/** Pastille ronde d'une marque : logo si disponible, sinon son nom à sa couleur. */
export function BrandBadge({ brand, className = "" }: { brand: string; className?: string }) {
  const { logo, color } = brandStyle(brand);
  return (
    <span className={`brand-badge ${className}`} aria-hidden="true" style={{ "--brand": color } as React.CSSProperties}>
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo} alt="" width={256} height={256} loading="lazy" decoding="async" />
      ) : (
        <span className="brand-badge-name">{brand}</span>
      )}
    </span>
  );
}
