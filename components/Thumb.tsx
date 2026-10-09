import { sizedImage } from "@/lib/image";

type Props = { src: string | null; alt: string; brand: string };

/** Image produit (lazy, tailles adaptées via le CDN Shopify) ou repère typographique si absente. */
export function Thumb({ src, alt, brand }: Props) {
  if (!src) {
    return (
      <div className="thumb thumb-empty" aria-hidden="true">
        <span>{brand.trim().charAt(0).toUpperCase()}</span>
      </div>
    );
  }
  return (
    <div className="thumb">
      {/* eslint-disable-next-line @next/next/no-img-element -- le CDN Shopify redimensionne déjà */}
      <img
        src={sizedImage(src, 400)}
        srcSet={`${sizedImage(src, 240)} 240w, ${sizedImage(src, 400)} 400w, ${sizedImage(src, 640)} 640w`}
        sizes="(min-width: 1100px) 220px, (min-width: 700px) 28vw, 46vw"
        alt={alt}
        loading="lazy"
        decoding="async"
        width={400}
        height={400}
      />
    </div>
  );
}
