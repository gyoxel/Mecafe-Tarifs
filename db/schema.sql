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
alter table commercial_price_history add column if not exists option_id text; -- null = avant les options

-- Prix saisis par option. Sans ligne ici, l'option applique prix site + écart (price_options).
-- À sa création, la table reprend les anciens prix de commercial_prices dans « autre ».
create table if not exists option_prices (
  option_id  text not null,
  variant_id text not null,
  sku        text,
  label      text,
  price      numeric(10,2) not null check (price >= 0),
  updated_at timestamptz not null default now(),
  primary key (option_id, variant_id)
);

-- Options de prix (gérées depuis la page de modification). Créée avec A (−10), B (−9), C (−8, par défaut).
create table if not exists price_options (
  id           text primary key,
  name         text not null,
  price_offset numeric(10,2) not null,  -- ajouté au prix du site : −10 = prix site moins 10 DH
  position     integer not null,
  is_default   boolean not null default false,
  created_at   timestamptz not null default now()
);
