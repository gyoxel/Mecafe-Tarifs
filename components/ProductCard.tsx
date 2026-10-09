"use client";

import { memo } from "react";
import { formatDH } from "@/lib/format";
import type { CatalogItem } from "@/lib/types";
import { EyeIcon } from "./Icons";
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

  return (
    <article className="card" data-revealed={revealed}>
      <Thumb src={item.image} alt={item.title} brand={item.brand} />

      <div className="card-body">
        <p className="card-brand">{item.brand}</p>
        <h3 className="card-title">{item.title}</h3>
        {item.variant && <span className="card-variant">{item.variant}</span>}

        <div className="price-site">
          <div className="price-block">
            <span className="amount">
              {item.compareAt && <s className="compare">{formatDH(item.compareAt)}</s>}
              {formatDH(item.price)}
            </span>
            <span className="label">Prix site</span>
          </div>
          <button
            type="button"
            className="eye-btn"
            aria-pressed={revealed}
            aria-label={`${revealed ? "Masquer" : "Afficher"} le prix commercial : ${name}`}
            onClick={() => onToggle(item.id, !revealed)}
          >
            <EyeIcon off={!revealed} size={18} />
          </button>
        </div>

        <div className="reveal" data-open={revealed}>
          {/* inert : zone fermée = ni focus clavier ni lecteur d'écran */}
          <div className="reveal-inner" inert={!revealed}>
            <div className="price-commercial">
              {commercial == null ? (
                <span className="amount amount-empty">Non défini</span>
              ) : (
                <span className="amount">{formatDH(commercial)}</span>
              )}
              <span className="label">Prix commercial</span>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

export const ProductCard = memo(ProductCardBase);
