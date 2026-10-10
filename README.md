# Mécafé — Tarifs professionnels

Catalogue tarifaire : `tarifs.mecafe.ma`. Shopify reste la source des produits, images et prix publics.
- **Commerciaux** (`/`, sans mot de passe) : le catalogue avec les **prix du site** uniquement ; l'image et le
  nom ouvrent la page du produit sur mecafe.ma.
- **Admin** (`/admin`, code admin) : choix d'un commercial, puis ses **prix commerciaux** (prix site − son écart,
  ou prix saisi) avec l'œil et le clic sur le prix ; stock visible. **Gestion** (`/admin/gestion`) : commerciaux,
  villes, écarts, prix.

```
Shopify (Storefront API) ──► Vercel (Next.js, lecture en direct) ──► tarifs.mecafe.ma
                                   │
                                   └──► Postgres (commerciaux, prix commerciaux)
```

## Principes
- **Toujours à jour :** pas de cache, chaque affichage relit Shopify (prix, produits, menu, ordre).
- **Le navigateur ne parle jamais à Shopify.** Le token reste dans les variables d'environnement Vercel.
- **Catalogue public, prix commerciaux protégés.** La page `/` n'envoie ni prix commercial, ni nom de commercial,
  ni ville, ni stock. `/admin`, `/admin/gestion` et `/api/admin/*` exigent la session admin (`proxy.ts` + revérification
  côté serveur). L'œil 👁️ est un confort d'affichage (discrétion devant un client), pas la sécurité.
- **Un seul code** : `ADMIN_PASSWORD`. Le site n'est ni indexé (`noindex`) ni lié depuis mecafe.ma.
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
Sans variables d'environnement : catalogue de **démonstration**, code admin `admin`, prix commerciaux en mémoire
(non persistants).

## Variables d'environnement
Voir `.env.example`. En production, `ADMIN_PASSWORD` et `SESSION_SECRET` (≥ 32 caractères,
`openssl rand -base64 48`) sont **obligatoires** : sans eux, la connexion admin est refusée.

## Mise en production (Vercel)
Projet Vercel : `mecafe-tarifs` (déploiement automatique à chaque push sur la branche de production).
Fonctions en région Frankfurt (`vercel.json` → `fra1`), comme la base Neon.

1. **Variables** (Settings → Environment Variables, type *Sensitive*) :
   `ADMIN_PASSWORD`, `SESSION_SECRET` (≥ 32 caractères, `openssl rand -base64 48`),
   `SHOPIFY_STORE_DOMAIN` (`xxx.myshopify.com`), `SHOPIFY_STOREFRONT_TOKEN` (jeton privé `shpat_…`),
   et si besoin `SHOPIFY_MENU_HANDLE` (menu des catégories, défaut `main-menu-gx`).
2. **Postgres** : Storage → Neon, connecté au projet avec le préfixe `DATABASE` (→ `DATABASE_URL`).
   Ne pas cocher « Create database branch for deployment » pour *Production* : la production doit
   toujours utiliser la branche principale de la base. Les tables se créent seules (cf. `db/schema.sql`).
3. **Domaine** : `tarifs.mecafe.ma` ajouté au projet ; chez l'hébergeur DNS de `mecafe.ma`, un
   `CNAME tarifs → <valeur indiquée par Vercel>` (Settings → Domains).
4. (Recommandé) Vercel Firewall : règle de rate-limit sur `POST /api/login`.

## Commerciaux et prix commerciaux
Chaque **commercial** a un nom, une **ville** (facultative) et un **écart** appliqué automatiquement au prix du
site (−10 = prix site moins 10 DH, suit le prix du site en direct), plus ses propres prix saisis à la main qui
remplacent ce calcul produit par produit. Au premier lancement : A (−10), B (−9), C (−8).

- **Admin** (bouton « Admin » en haut du catalogue → code, demandé à chaque fois ; session fermée avec le
  navigateur, 12 h au plus) : une fenêtre sur la page floutée demande le commercial (recherche par nom ou
  ville, liste déroulante des villes, « + Ajouter un commercial »). Ensuite le catalogue
  affiche ses prix (œil global, clic sur le prix). Le nom en haut ouvre une liste déroulante pour en changer
  (la fenêtre floutée ne sert qu'à l'arrivée) ; l'écart y apparaît en petit.
- **Panier** (admin seulement, mémorisé sur l'appareil) : « + » en haut à droite de chaque produit, puis le
  nombre ; un appui ouvre − n + (saisie directe possible). Sur ordinateur, le panier s'ouvre à droite à côté des
  produits (réductible) ; sur téléphone / tablette, bouton panier en bas à droite (animé, avec le nombre) qui
  ouvre une grande fenêtre qu'on redescend. Prix = ceux du commercial choisi (prix du site si aucun, marqué *).
  *Voir la facture* : brouillon, avec **Modifier** (retour au panier) ou **Confirmer**. Une facture confirmée est
  numérotée (F2026-00001), figée (prix recalculés et enregistrés côté serveur), ajoutée à l'historique, et le
  panier repart à zéro. *Imprimer la facture* = confirmer puis imprimer (A4, seule la facture sort ; « Enregistrer
  en PDF » du navigateur pour un fichier). Seule une facture confirmée s'imprime.
  Facture confirmée : **Modifier** (elle revient dans le panier, bandeau « Modification de la facture … » ;
  l'enregistrement garde le même n° et note « Modifiée le … »), **Partager PDF** (feuille de partage du
  téléphone : WhatsApp, e-mail… ; sur ordinateur : téléchargement du PDF) et **Imprimer**. Le PDF est généré
  côté serveur (`/api/admin/invoices/<id>/pdf`, `lib/invoice-pdf.ts`).
- **Gestion** (barre latérale, onglets en haut sur mobile) :
  - *Commerciaux et villes* (`/admin/gestion`, page d'arrivée) : ajouter, modifier (nom, ville, écart), supprimer (avec ses prix saisis). L'écart
    s'écrit sans signe (le « − » est fixe). Villes : grandes villes du Maroc (`lib/cities.ts`) ; une ville absente
    s'ajoute depuis la recherche (« + Ajouter ») ;
  - *Factures* (`/admin/gestion/factures`) : historique des factures confirmées ; recherche (n°, commercial,
    ville, produit), filtre par commercial, dates (du / au, aujourd'hui, 7 jours, ce mois), total ; ouvrir,
    réimprimer, partager en PDF ou **modifier** une facture (retour au catalogue avec la facture dans le panier) ;
  - *Prix des produits* (`/admin/gestion/prix`) : choisir le commercial, puis saisie dans le tableau puis *Enregistrer* (en gris = prix automatique ; champ vidé =
    retour au prix automatique) ; **Exporter / Importer CSV** pour ce commercial (colonne `prix_commercial`,
    rattachement par `variant_id`, sinon par `sku` ; cellule vide = inchangé).

Tables : `price_options` (commerciaux), `option_prices` (prix saisis), `invoices` (factures confirmées), historique
des prix dans `commercial_price_history`.

## Personnaliser
- `lib/config.ts` : ordre des marques/catégories, alias de marques, règles collections → catégories.
- `app/globals.css` : couleurs et animations (variables en tête de fichier).
- Stockage des prix : `lib/prices.ts` expose seulement `getPrices` / `savePrices` ; changer de backend n'affecte pas l'UI.

## Structure
```
proxy.ts                 garde d'accès (/admin et /api/admin/* réservés à l'admin)
app/page.tsx             catalogue public (prix du site seulement)
app/admin/page.tsx       catalogue admin (choix du commercial, prix commerciaux, stock)
app/admin/gestion/       Gestion : commerciaux et villes ; prix/ : prix des produits par commercial
app/api/                 login, logout, admin/{options,prices,import,export}
components/              Catalog, CommercialChooser, ProductCard (yeux + animation), AdminPrices…
lib/shopify.ts           requêtes GraphQL (sans cache : données toujours à jour)
lib/price-options.ts     commerciaux (nom, ville, écart)
lib/prices.ts, db.ts     prix saisis (Postgres, ou mémoire en démo)
lib/session.ts, auth.ts  JWT signé en cookie HttpOnly, code admin comparé en temps constant
```
