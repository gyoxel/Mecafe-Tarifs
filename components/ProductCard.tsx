"use client";

import { memo } from "react";
import { brandStyle } from "@/lib/brands";
import { formatDH } from "@/lib/format";
import { displayTitle, displayVariant } from "@/lib/title";
import type { CatalogItem } from "@/lib/types";
import { Price } from "./Price";
import { StockBadge } from "./StockBadge";
import { Thumb } from "./Thumb";

type Props = {
  item: CatalogItem;
  /** Prix commercial défini pour ce variant, sinon undefined. */
  commercial: number | undefined;
  /** Nom de l'option affichée sous le prix commercial (« Option A »…). */
  proLabel: string;
  /** false (catalogue public) : la barre n'affiche que le prix du site et ne réagit pas au clic. */
  revealable: boolean;
  /** Le prix commercial est-il affiché ? (calculé par le parent : interrupteur global + exception individuelle) */
  revealed: boolean;
  onToggle: (id: string, next: boolean) => void;
};

function ProductCardBase({ item, commercial, proLabel, revealable, revealed, onToggle }: Props) {
  const name = item.variant ? `${item.title}, ${item.variant}` : item.title;
  // Image et nom ouvrent la page du produit sur mecafe.ma (nouvel onglet, sans référent : le site des tarifs
  // n'apparaît pas côté boutique).
  const link = item.url
    ? { href: item.url, target: "_blank", rel: "noopener noreferrer", title: `Voir ${name} sur mecafe.ma` }
    : null;
  const siteCell = (
    <span className="price-cell price-cell-site">
      <span className="price-cell-inner">
        <Price value={item.price} />
        <span className="label">
          Prix site
          {item.compareAt && <s className="compare">{formatDH(item.compareAt)}</s>}
        </span>
      </span>
    </span>
  );

  return (
    <article className="card" data-revealed={revealed} style={{ "--brand": brandStyle(item.brand).color } as React.CSSProperties}>
      <div className="card-media">
        {link ? (
          <a {...link} className="card-media-link">
            <Thumb src={item.image} alt={item.title} brand={item.brand} />
          </a>
        ) : (
          <Thumb src={item.image} alt={item.title} brand={item.brand} />
        )}
        {/* Le format est posé sur l'image : toutes les cartes gardent la même hauteur. */}
        {item.variant && <span className="tag tag-variant">{displayVariant(item.variant)}</span>}
        {item.compareAt && <span className="tag tag-promo">Promo</span>}
        {item.stock !== undefined && <StockBadge stock={item.stock} className="tag tag-stock" />}
      </div>

      <div className="card-body">
        <p className="card-brand">{item.brand}</p>
        <h3 className="card-title" title={item.title}>
          {link ? (
            <a {...link} className="card-title-link">
              {displayTitle(item.title, item.brand)}
            </a>
          ) : (
            displayTitle(item.title, item.brand)
          )}
        </h3>
      </div>

      {/* Barre de prix : un appui la partage en deux (prix site | prix commercial), un second la referme.
          La carte ne change jamais de taille. Catalogue public : prix du site seul, sans clic. */}
      {revealable ? (
        <button
          type="button"
          className="price-bar"
          aria-pressed={revealed}
          aria-label={`${revealed ? "Masquer" : "Afficher"} le prix commercial : ${name}`}
          onClick={() => onToggle(item.id, !revealed)}
        >
          {siteCell}
          <span className="price-cell price-cell-pro" aria-hidden={!revealed}>
            <span className="price-cell-inner">
              {commercial == null ? <span className="amount amount-empty">—</span> : <Price value={commercial} />}
              <span className="label">{commercial == null ? "Non défini" : proLabel}</span>
            </span>
          </span>
        </button>
      ) : (
        <div className="price-bar price-bar-static">{siteCell}</div>
      )}
    </article>
  );
}

export const ProductCard = memo(ProductCardBase);
