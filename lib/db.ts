import "server-only";
import postgres from "postgres";
import { SEED_OPTIONS } from "./options";

type Sql = ReturnType<typeof postgres>;

const g = globalThis as unknown as { __sql?: Sql; __schema?: Promise<void> };

export function isDbConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export function getSql(): Sql {
  if (!g.__sql) {
    g.__sql = postgres(process.env.DATABASE_URL!, {
      max: 1, // serverless : une connexion par instance
      idle_timeout: 20,
      prepare: false, // compatible avec les poolers (pgbouncer / Neon pooled)
    });
  }
  return g.__sql;
}

/** Crée les tables au premier accès (équivalent de db/schema.sql). */
export function ensureSchema(): Promise<void> {
  if (!g.__schema) {
    const sql = getSql();
    g.__schema = (async () => {
      await sql`
        create table if not exists commercial_prices (
          variant_id text primary key,
          sku text,
          label text,
          price numeric(10,2) not null check (price >= 0),
          updated_at timestamptz not null default now()
        )`;
      await sql`
        create table if not exists commercial_price_history (
          id bigserial primary key,
          variant_id text not null,
          old_price numeric(10,2),
          new_price numeric(10,2),
          changed_at timestamptz not null default now()
        )`;
      await sql`
        create index if not exists commercial_price_history_variant_idx
        on commercial_price_history (variant_id, changed_at desc)`;
      await sql`alter table commercial_price_history add column if not exists option_id text`;
      // Prix par option (A, B, C, Autre). À sa création, la table reprend les prix saisis avant
      // l'arrivée des options : ils vont dans « Autre » (l'ancienne table reste intacte).
      await sql.begin(async (tx) => {
        await tx`select pg_advisory_xact_lock(727001)`;
        const [{ exists }] = await tx`select to_regclass('option_prices') is not null as exists`;
        if (exists) return;
        await tx`
          create table option_prices (
            option_id text not null,
            variant_id text not null,
            sku text,
            label text,
            price numeric(10,2) not null check (price >= 0),
            updated_at timestamptz not null default now(),
            primary key (option_id, variant_id)
          )`;
        await tx`
          insert into option_prices (option_id, variant_id, sku, label, price, updated_at)
          select 'autre', variant_id, sku, label, price, updated_at from commercial_prices`;
      });
      // Options de prix (nom + écart), créées avec A, B, C (C par défaut).
      await sql.begin(async (tx) => {
        await tx`select pg_advisory_xact_lock(727002)`;
        const [{ exists }] = await tx`select to_regclass('price_options') is not null as exists`;
        if (exists) return;
        await tx`
          create table price_options (
            id text primary key,
            name text not null,
            price_offset numeric(10,2) not null,
            position integer not null,
            is_default boolean not null default false,
            created_at timestamptz not null default now()
          )`;
        for (const [i, o] of SEED_OPTIONS.entries()) {
          await tx`
            insert into price_options (id, name, price_offset, position, is_default)
            values (${o.id}, ${o.name}, ${o.offset}, ${i}, ${o.isDefault})`;
        }
      });
      await sql`alter table price_options add column if not exists city text`;
      // Historique des factures confirmées (lignes figées en JSON).
      await sql`
        create table if not exists invoices (
          id bigserial primary key,
          number text not null unique,
          commercial_id text,
          commercial_name text not null,
          commercial_city text,
          lines jsonb not null,
          item_count integer not null,
          total numeric(12,2) not null,
          status text not null default 'confirmee',
          created_at timestamptz not null default now()
        )`;
      await sql`create index if not exists invoices_created_idx on invoices (created_at desc)`;
    })().catch((err) => {
      g.__schema = undefined; // réessayer au prochain appel
      throw err;
    });
  }
  return g.__schema;
}
