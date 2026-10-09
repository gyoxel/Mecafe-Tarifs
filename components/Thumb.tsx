"use client";

import { useEffect, useRef, useState } from "react";
import { sizedImage } from "@/lib/image";

type Props = { src: string | null; alt: string; brand: string };

/** Image produit : chargement différé, fondu à l'apparition, repère typographique si absente. */
export function Thumb({ src, alt, brand }: Props) {
  const ref = useRef<HTMLImageElement>(null);
  const [state, setState] = useState<"loading" | "loaded" | "error">("loading");

  // Image déjà en cache avant l'hydratation : onLoad ne se déclenche pas.
  useEffect(() => {
    const img = ref.current;
    if (img?.complete) setState(img.naturalWidth > 0 ? "loaded" : "error");
  }, []);

  if (!src || state === "error") {
    return (
      <div className="thumb thumb-empty" aria-hidden="true">
        <span>{brand.trim().charAt(0).toUpperCase()}</span>
      </div>
    );
  }
  return (
    <div className="thumb" data-state={state}>
      {/* eslint-disable-next-line @next/next/no-img-element -- le CDN Shopify redimensionne déjà */}
      <img
        ref={ref}
        src={sizedImage(src, 400)}
        srcSet={`${sizedImage(src, 260)} 260w, ${sizedImage(src, 400)} 400w, ${sizedImage(src, 640)} 640w`}
        sizes="(min-width: 1200px) 230px, (min-width: 700px) 30vw, 46vw"
        alt={alt}
        loading="lazy"
        decoding="async"
        width={400}
        height={400}
        onLoad={() => setState("loaded")}
        onError={() => setState("error")}
      />
    </div>
  );
}
