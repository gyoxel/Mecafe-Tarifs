-- Prix commerciaux, indexés par variant Shopify (ID numérique stable).
-- Le schéma est aussi créé automatiquement au premier accès (lib/db.ts).
create table if not exists commercial_prices (
  variant_id text primary key,
  sku        text,
  label      text,                      -- "Produit — format", pour lisibilité (admin / CSV)
  price      numeric(10,2) not null check (price >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists commercial_price_history (
  id         bigserial primary key,
  variant_id text not null,
  old_price  numeric(10,2),
  new_price  numeric(10,2),             -- null = prix supprimé
  changed_at timestamptz not null default now()
);
create index if not exists commercial_price_history_variant_idx
  on commercial_price_history (variant_id, changed_at desc);
