"use client";

import { memo } from "react";
import { formatDH } from "@/lib/format";
import { displayTitle, displayVariant } from "@/lib/title";
import type { CatalogItem } from "@/lib/types";
import { brandStyle } from "@/lib/brands";
import { Price } from "./Price";
import { StockBadge } from "./StockBadge";
import { Thumb } from "./Thumb";

type Props = {
  item: CatalogItem;
  commercial: number | undefined;
  /** false (catalogue public) : pas de colonne prix commercial. */
  revealable: boolean;
  revealed: boolean;
  onToggle: (id: string, next: boolean) => void;
};

/** Ligne de la vue « Liste » (écrans larges) : mêmes données et même logique d'affichage que la carte. */
function ProductRowBase({ item, commercial, revealable, revealed, onToggle }: Props) {
  const name = item.variant ? `${item.title}, ${item.variant}` : item.title;
  const link = item.url
    ? { href: item.url, target: "_blank", rel: "noopener noreferrer", title: `Voir ${name} sur mecafe.ma` }
    : null;
  return (
    <div className="row" role="row" data-revealed={revealed} style={{ "--brand": brandStyle(item.brand).color } as React.CSSProperties}>
      <div className="row-thumb" role="cell">
        {link ? (
          <a {...link} className="card-media-link">
            <Thumb src={item.image} alt="" brand={item.brand} small />
          </a>
        ) : (
          <Thumb src={item.image} alt="" brand={item.brand} small />
        )}
      </div>
      <div className="row-main" role="cell">
        <p className="card-brand">{item.brand}</p>
        <p className="row-title" title={item.title}>
          {link ? (
            <a {...link} className="card-title-link">
              {displayTitle(item.title, item.brand)}
            </a>
          ) : (
            displayTitle(item.title, item.brand)
          )}
        </p>
      </div>
      <div className="row-variant" role="cell">
        {item.variant ? <span className="row-chip">{displayVariant(item.variant)}</span> : <span className="muted">—</span>}
        {item.compareAt && <span className="row-promo">Promo</span>}
      </div>
      {item.stock !== undefined && (
        <div className="row-stock" role="cell">
          <StockBadge stock={item.stock} />
        </div>
      )}
      <div className="row-price" role="cell">
        <Price value={item.price} />
        {item.compareAt && <s className="compare">{formatDH(item.compareAt)}</s>}
      </div>
      {revealable && (
        <div className="row-pro-cell" role="cell">
          <button
            type="button"
            className="row-pro"
            aria-pressed={revealed}
            aria-label={`${revealed ? "Masquer" : "Afficher"} le prix commercial : ${name}`}
            onClick={() => onToggle(item.id, !revealed)}
          >
            {!revealed ? (
              <span className="row-pro-hidden">Afficher</span>
            ) : commercial == null ? (
              <span className="row-pro-empty">Non défini</span>
            ) : (
              <Price value={commercial} />
            )}
          </button>
        </div>
      )}
    </div>
  );
}

export const ProductRow = memo(ProductRowBase);
