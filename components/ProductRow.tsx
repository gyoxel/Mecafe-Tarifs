"use client";

import { memo } from "react";
import { formatDH } from "@/lib/format";
import { displayTitle } from "@/lib/title";
import type { CatalogItem } from "@/lib/types";
import { brandStyle } from "@/lib/brands";
import { Price } from "./Price";
import { Thumb } from "./Thumb";

type Props = {
  item: CatalogItem;
  commercial: number | undefined;
  revealed: boolean;
  onToggle: (id: string, next: boolean) => void;
};

/** Ligne de la vue « Liste » (écrans larges) : mêmes données et même logique d'affichage que la carte. */
function ProductRowBase({ item, commercial, revealed, onToggle }: Props) {
  const name = item.variant ? `${item.title}, ${item.variant}` : item.title;
  return (
    <div className="row" role="row" data-revealed={revealed} style={{ "--brand": brandStyle(item.brand).color } as React.CSSProperties}>
      <div className="row-thumb" role="cell">
        <Thumb src={item.image} alt="" brand={item.brand} small />
      </div>
      <div className="row-main" role="cell">
        <p className="card-brand">{item.brand}</p>
        <p className="row-title" title={item.title}>
          {displayTitle(item.title, item.brand)}
        </p>
      </div>
      <div className="row-variant" role="cell">
        {item.variant ? <span className="row-chip">{item.variant}</span> : <span className="muted">—</span>}
        {item.compareAt && <span className="row-promo">Promo</span>}
      </div>
      <div className="row-price" role="cell">
        <Price value={item.price} />
        {item.compareAt && <s className="compare">{formatDH(item.compareAt)}</s>}
      </div>
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
    </div>
  );
}

export const ProductRow = memo(ProductRowBase);
