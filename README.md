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
- **Une carte = un variant (format).** Marque = champ *Fournisseur* (`vendor`, ex. `Orsadrinks` → affiché `ODK`).
- **Catégories = menu Shopify « Main menu (GX) »** (`main-menu-gx`, Contenu → Menus) : niveau 1 = catégorie,
  niveau 2 = sous-catégorie, rattachement par collection. Modifier le menu dans Shopify suffit (mise à jour sous 5 min).
  Les produits absents du menu apparaissent dans « Autres ». Sans menu accessible, repli sur les règles de
  `lib/config.ts` (`CATEGORY_RULES`). Le jeton Storefront doit avoir `unauthenticated_read_content`.

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
Projet Vercel : `mecafe-tarifs` (déploiement automatique à chaque push sur la branche de production).
Fonctions en région Frankfurt (`vercel.json` → `fra1`), comme la base Neon.

1. **Variables** (Settings → Environment Variables, type *Sensitive*) :
   `APP_PASSWORD`, `ADMIN_PASSWORD`, `SESSION_SECRET` (≥ 32 caractères, `openssl rand -base64 48`),
   `SHOPIFY_STORE_DOMAIN` (`xxx.myshopify.com`), `SHOPIFY_STOREFRONT_TOKEN` (jeton privé `shpat_…`),
   et si besoin `SHOPIFY_MENU_HANDLE` (menu des catégories, défaut `main-menu-gx`).
2. **Postgres** : Storage → Neon, connecté au projet avec le préfixe `DATABASE` (→ `DATABASE_URL`).
   Ne pas cocher « Create database branch for deployment » pour *Production* : la production doit
   toujours utiliser la branche principale de la base. Les tables se créent seules (cf. `db/schema.sql`).
3. **Domaine** : `tarifs.mecafe.ma` ajouté au projet ; chez l'hébergeur DNS de `mecafe.ma`, un
   `CNAME tarifs → <valeur indiquée par Vercel>` (Settings → Domains).
4. (Optionnel) **Mise à jour instantanée** : dans Shopify → Paramètres → Notifications → Webhooks, créer les
   événements *Création / Mise à jour / Suppression de produit* vers `https://tarifs.mecafe.ma/api/revalidate`
   et copier la clé de signature dans `SHOPIFY_WEBHOOK_SECRET`. Sans webhook, le catalogue se rafraîchit seul
   toutes les 5 minutes.
5. (Recommandé) Vercel Firewall : règle de rate-limit sur `POST /api/login`.

## Gérer les prix commerciaux
Connexion avec le mot de passe admin → pied de page → **Administration** :
- saisie directe dans le tableau puis *Enregistrer* (champ vidé = prix supprimé) ;
- **Exporter CSV** → modifier dans Excel (colonne `prix_commercial`) → **Importer CSV** (rattachement par
  `variant_id`, sinon par `sku` ; cellule vide = inchangé) ;
- *Rafraîchir depuis Shopify* force la relecture du catalogue.
Chaque changement est historisé dans `commercial_price_history`.

## Personnaliser
- `lib/config.ts` : ordre des marques/catégories, alias de marques, règles collections → catégories.
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
