# Mécafé — Tarifs professionnels

Catalogue tarifaire pour les commerciaux : `tarifs.mecafe.ma`.
Shopify reste la source des produits, images et prix publics ; cette application (Next.js sur Vercel) les affiche
avec, en plus, un **prix commercial** par produit, protégé côté serveur.

```
Shopify (Storefront API) ──► Vercel (Next.js, cache 5 min) ──► tarifs.mecafe.ma
                                   │
                                   └──► Postgres (prix commerciaux)
```

## Principes
- **Le navigateur ne parle jamais à Shopify.** Le token reste dans les variables d'environnement Vercel.
- **Tout le site est derrière un mot de passe.** Sans session, `proxy.ts` redirige vers `/login`, et aucune donnée
  (ni catalogue, ni prix commercial) n'est envoyée. L'œil 👁️ est un confort d'affichage (discrétion devant un client),
  pas la sécurité.
- **Deux mots de passe** : `APP_PASSWORD` (commerciaux : lecture) et `ADMIN_PASSWORD` (modifier les prix, `/admin`).
- **Prix commercial indépendant** : stocké dans Postgres par variant Shopify, jamais écrit dans Shopify.
- **Une carte = un variant (format).** Marque = champ *Fournisseur* (`vendor`), catégorie = *Type de produit*.

## Lancer en local
```bash
npm install
npm run dev        # http://localhost:3000
```
Sans variables d'environnement : catalogue de **démonstration**, mots de passe `demo` (commerciaux) et `admin`,
prix commerciaux en mémoire (non persistants).

## Variables d'environnement
Voir `.env.example`. En production, `APP_PASSWORD`, `ADMIN_PASSWORD` et `SESSION_SECRET` (≥ 32 caractères,
`openssl rand -base64 48`) sont **obligatoires** : sans eux, la connexion est refusée.

## Mise en production (Vercel)
1. Importer le repo dans Vercel.
2. **Postgres** : Storage → ajouter Neon (ou Supabase) ; `DATABASE_URL` est injectée. Les tables se créent seules
   (cf. `db/schema.sql`).
3. **Shopify** : créer un accès *Storefront API* en lecture sur les produits (canal *Headless* → jeton privé `shpat_…`,
   ou app personnalisée), puis renseigner `SHOPIFY_STORE_DOMAIN` et `SHOPIFY_STOREFRONT_TOKEN`.
   Les procédures de Shopify évoluent : vérifier la création du jeton dans leur documentation.
4. **Domaine** : Settings → Domains → `tarifs.mecafe.ma`, puis chez le gestionnaire DNS de `mecafe.ma` un
   `CNAME tarifs → cname.vercel-dns.com` (valeur exacte indiquée par Vercel).
5. (Optionnel) **Mise à jour instantanée** : dans Shopify → Paramètres → Notifications → Webhooks, créer les
   événements *Création / Mise à jour / Suppression de produit* vers `https://tarifs.mecafe.ma/api/revalidate`
   et copier la clé de signature dans `SHOPIFY_WEBHOOK_SECRET`. Sans webhook, le catalogue se rafraîchit seul
   toutes les 5 minutes.
6. (Recommandé) Vercel Firewall : règle de rate-limit sur `POST /api/login`.

## Gérer les prix commerciaux
Connexion avec le mot de passe admin → pied de page → **Administration** :
- saisie directe dans le tableau puis *Enregistrer* (champ vidé = prix supprimé) ;
- **Exporter CSV** → modifier dans Excel (colonne `prix_commercial`) → **Importer CSV** (rattachement par
  `variant_id`, sinon par `sku` ; cellule vide = inchangé) ;
- *Rafraîchir depuis Shopify* force la relecture du catalogue.
Chaque changement est historisé dans `commercial_price_history`.

## Personnaliser
- `lib/config.ts` : ordre des marques/catégories, regroupement de types Shopify en une catégorie (`CATEGORY_ALIASES`).
- `app/globals.css` : couleurs et animations (variables en tête de fichier).
- Stockage des prix : `lib/prices.ts` expose seulement `getPrices` / `savePrices` ; changer de backend n'affecte pas l'UI.

## Structure
```
proxy.ts                 garde d'accès (session obligatoire, /admin réservé à l'admin)
app/page.tsx             catalogue (serveur : session → catalogue + prix → composant client)
app/admin/               édition des prix
app/api/                 login, logout, revalidate (webhook), admin/{prices,import,export,refresh}
components/              Catalog, ProductCard (yeux + animation), AdminPrices…
lib/shopify.ts           requêtes GraphQL paginées + cache
lib/prices.ts, db.ts     prix commerciaux (Postgres, ou mémoire en démo)
lib/session.ts, auth.ts  JWT signé en cookie HttpOnly, mots de passe comparés en temps constant
```
