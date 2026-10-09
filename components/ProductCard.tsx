"use client";

import { memo } from "react";
import { formatDH } from "@/lib/format";
import type { CatalogItem } from "@/lib/types";
import { EyeIcon } from "./Icons";
import { Price } from "./Price";
import { Thumb } from "./Thumb";

type Props = {
  item: CatalogItem;
  /** Prix commercial défini pour ce variant, sinon undefined. */
  commercial: number | undefined;
  /** Le prix commercial est-il affiché ? (calculé par le parent : œil global + exception individuelle) */
  revealed: boolean;
  onToggle: (id: string, next: boolean) => void;
};

function ProductCardBase({ item, commercial, revealed, onToggle }: Props) {
  const name = item.variant ? `${item.title}, ${item.variant}` : item.title;
  const gap = commercial == null ? 0 : Math.round((commercial - item.price) * 100) / 100;

  return (
    <article className="card" data-revealed={revealed}>
      <div className="card-media">
        <Thumb src={item.image} alt={item.title} brand={item.brand} />
        {item.compareAt && <span className="badge">Promo</span>}
      </div>

      <div className="card-body">
        <p className="card-brand">{item.brand}</p>
        <h3 className="card-title" title={item.title}>
          {item.title}
        </h3>
        {item.variant && <span className="card-variant">{item.variant}</span>}

        <div className="price-site">
          <div className="price-block">
            <Price value={item.price} />
            <span className="label">
              Prix site
              {item.compareAt && <s className="compare">{formatDH(item.compareAt)}</s>}
            </span>
          </div>
          <button
            type="button"
            className="eye-btn"
            aria-pressed={revealed}
            aria-label={`${revealed ? "Masquer" : "Afficher"} le prix commercial : ${name}`}
            onClick={() => onToggle(item.id, !revealed)}
          >
            <EyeIcon off={!revealed} size={19} />
          </button>
        </div>

        <div className="reveal" data-open={revealed}>
          {/* inert : zone fermée = ni focus clavier ni lecteur d'écran */}
          <div className="reveal-inner" inert={!revealed}>
            <div className="price-commercial">
              <div className="price-block">
                {commercial == null ? (
                  <span className="amount amount-empty">Non défini</span>
                ) : (
                  <Price value={commercial} />
                )}
                <span className="label">Prix commercial</span>
              </div>
              {gap !== 0 && (
                <span className="gap" data-up={gap > 0}>
                  {gap < 0 ? "−" : "+"}
                  {formatDH(Math.abs(gap))}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

export const ProductCard = memo(ProductCardBase);
