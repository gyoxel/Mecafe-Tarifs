# Mécafé — Tarifs professionnels

Catalogue tarifaire pour les commerciaux : `tarifs.mecafe.ma`.
Shopify reste la source des produits, images et prix publics ; cette application (Next.js sur Vercel) les affiche
avec, en plus, un **prix commercial** par produit, protégé côté serveur.

```
Shopify (Storefront API) ──► Vercel (Next.js, lecture en direct) ──► tarifs.mecafe.ma
                                   │
                                   └──► Postgres (prix commerciaux)
```

## Principes
- **Toujours à jour :** pas de cache, chaque affichage relit Shopify (prix, produits, menu, ordre).
- **Le navigateur ne parle jamais à Shopify.** Le token reste dans les variables d'environnement Vercel.
- **Tout le site est derrière un mot de passe.** Sans session, `proxy.ts` redirige vers `/login`, et aucune donnée
  (ni catalogue, ni prix commercial) n'est envoyée. L'œil 👁️ est un confort d'affichage (discrétion devant un client),
  pas la sécurité.
- **Deux mots de passe** : `APP_PASSWORD` (commerciaux : lecture) et `ADMIN_PASSWORD` (modifier les prix, `/admin`).
- **Prix commercial indépendant** : stocké dans Postgres par variant Shopify, jamais écrit dans Shopify.
- **Une carte = un variant (format).** Marque = champ *Fournisseur* (`vendor`, ex. `Orsadrinks` → affiché `ODK`).
- **Catégories = menu Shopify « Main menu (GX) »** (`main-menu-gx`, Contenu → Menus) : jusqu'à 3 niveaux
  (ex. Café › Café en Grains › Mécafé 250g), rattachement par collection. Modifier le menu dans Shopify suffit (visible au rechargement suivant).
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
4. (Recommandé) Vercel Firewall : règle de rate-limit sur `POST /api/login`.

## Gérer les prix commerciaux
Chaque **option** (A, B, C, ou le nom d'un commercial) a un **écart** appliqué automatiquement au prix du
site (−10 = prix site moins 10 DH, suit le prix du site en direct), et ses propres prix saisis à la main qui
remplacent ce calcul produit par produit. Au premier lancement : A (−10), B (−9), C (−8, par défaut).

En haut du catalogue, une liste déroulante avec recherche par nom choisit l'option affichée (mémorisée
par appareil ; à défaut, l'option par défaut).

Connexion avec le mot de passe admin → **Modifier les prix** :
- **Gérer les options** : ajouter (nom + écart), renommer, changer l'écart, choisir l'option par défaut,
  supprimer (avec ses prix saisis) ;
- **Option à modifier** → saisie directe dans le tableau puis *Enregistrer* (en gris = prix automatique ;
  champ vidé = retour au prix automatique) ;
- **Exporter CSV** → modifier dans Excel (colonne `prix_commercial`) → **Importer CSV** dans la même option
  (rattachement par `variant_id`, sinon par `sku` ; cellule vide = inchangé).

Tables : `price_options` (options), `option_prices` (prix saisis), historique dans `commercial_price_history`.

## Personnaliser
- `lib/config.ts` : ordre des marques/catégories, alias de marques, règles collections → catégories.
- `app/globals.css` : couleurs et animations (variables en tête de fichier).
- Stockage des prix : `lib/prices.ts` expose seulement `getPrices` / `savePrices` ; changer de backend n'affecte pas l'UI.

## Structure
```
proxy.ts                 garde d'accès (session obligatoire, /admin réservé à l'admin)
app/page.tsx             catalogue (serveur : session → catalogue + prix → composant client)
app/admin/               édition des prix
app/api/                 login, logout, admin/{prices,import,export}
components/              Catalog, ProductCard (yeux + animation), AdminPrices…
lib/shopify.ts           requêtes GraphQL (sans cache : données toujours à jour)
lib/prices.ts, db.ts     prix commerciaux (Postgres, ou mémoire en démo)
lib/session.ts, auth.ts  JWT signé en cookie HttpOnly, mots de passe comparés en temps constant
```
