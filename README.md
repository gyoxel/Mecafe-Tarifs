# Mécafé — Tarifs professionnels

Catalogue tarifaire : `tarifs.mecafe.ma`. Shopify reste la source des produits, images et prix publics.
- **Entrée** (`/login`) : le site demande un code, sur un fond de catalogue flouté (factice : rien n'est envoyé
  avant le code). **Code clients** → catalogue au **prix public** (`/`) ; **code admin** → espace admin.
- **Clients** (`/`) : le catalogue avec les **prix du site** uniquement ; l'image et le nom ouvrent la page du
  produit sur mecafe.ma. Session gardée 30 jours sur l'appareil.
- **Admin** (`/admin`, code admin) : s'ouvre directement sur le tarif de base « Prix Gros », puis les **prix
  revendeurs** (le prix de chaque produit) avec l'œil et le clic sur le prix ; stock visible.
  **Gestion** (`/admin/gestion`) : revendeurs, villes, prix, devis.

```
Shopify (Storefront API) ──► Vercel (Next.js, lecture en direct) ──► tarifs.mecafe.ma
                                   │
                                   └──► Postgres (revendeurs, prix revendeurs, devis)
```

## Principes
- **Toujours à jour :** pas de cache, chaque affichage relit Shopify (prix, produits, menu, ordre).
- **Le navigateur ne parle jamais à Shopify.** Le token reste dans les variables d'environnement Vercel.
- **Catalogue sous code, prix revendeurs protégés.** La page `/` (code clients) n'envoie ni prix revendeur, ni nom de revendeur,
  ni ville, ni stock. `/admin`, `/admin/gestion` et `/api/admin/*` exigent la session admin (`proxy.ts` + revérification
  côté serveur). L'œil 👁️ est un confort d'affichage (discrétion devant un client), pas la sécurité.
- **Deux codes** : clients et admin. Codes de départ dans Vercel (`APP_PASSWORD`, `ADMIN_PASSWORD`), puis
  modifiables dans **Gestion › Codes d'accès** (le code admin actuel n'est demandé que pour changer le code admin). Un code changé est
  enregistré en base sous forme d'empreinte scrypt (jamais en clair, table `app_settings`) et remplace celui de
  Vercel ; les sessions ouvertes avec l'ancien code sont déconnectées (empreinte du code dans la session).
  **Code oublié** : dans la console Neon (SQL), `delete from app_settings where key = 'password:admin';`
  (ou `'password:client'`) : le code de Vercel redevient valable. Le site n'est ni indexé (`noindex`) ni lié
  depuis mecafe.ma.
- **Prix revendeur indépendant** : stocké dans Postgres par variant Shopify, jamais écrit dans Shopify.
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
Sans variables d'environnement : catalogue de **démonstration**, code admin `admin`, prix revendeurs en mémoire
(non persistants).

## Sans base de données = rien n'est enregistré (production)
En production, si `DATABASE_URL` manque, **toutes les écritures sont refusées** (devis, modifications, prix,
revendeurs : erreur 503 « Base de données non connectée… ») et un bandeau rouge s'affiche dans l'admin. Rien n'est
gardé en mémoire puis perdu en silence. Le stockage en mémoire n'existe qu'en développement local (démo).

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

## Revendeurs et prix revendeurs
Chaque **revendeur** a un nom, une **ville** (facultative) et **son prix pour chaque produit**, saisi dans
Gestion › Prix des produits (case vide = pas de prix revendeur pour ce produit : « — », et le devis est bloqué).
Il n'y a plus d'écart automatique (prix site − N DH).

**« Prix Gros » est le tarif de base** : c'est lui qui s'affiche à l'ouverture de l'admin ; il ne se renomme pas
et ne se supprime pas. **Un nouveau revendeur part d'une copie des prix de « Prix Gros »** (copie faite à la
création : changer « Prix Gros » ensuite ne modifie pas les revendeurs existants), puis se règle produit par produit.

Passage depuis l'ancien écart (automatique, une seule fois, `lib/price-freeze.ts`, marque `prices_frozen` en base) :
pour chaque revendeur (écart nul compris = prix du site), chaque produit sans prix saisi reçoit le prix que l'écart donnait (rien ne change à l'écran), puis l'écart
est remis à 0. L'ancienne base « Revendeur » est renommée « Prix Gros ».

- **Admin** (bouton « Admin » en haut du catalogue → code, demandé à chaque fois ; session fermée avec le
  navigateur, 12 h au plus) : le catalogue s'ouvre sur « Prix Gros » (prix de base), sans fenêtre de choix. Le nom
  en haut ouvre une liste déroulante (recherche par nom ou ville, filtre par ville) pour passer à un autre
  revendeur.
- **Panier** (admin seulement, mémorisé sur l'appareil) : « + » en haut à droite de chaque produit, puis le
  nombre ; un appui ouvre − n + (saisie directe possible). Sur ordinateur, le panier s'ouvre à droite à côté des
  produits (réductible) ; sur téléphone / tablette, bouton panier en bas à droite (animé, avec le nombre) qui
  ouvre une grande fenêtre qu'on redescend. Prix = **toujours** ceux du revendeur choisi : un produit sans prix
  revendeur est signalé dans le panier et bloque le devis (jamais de repli sur le prix du site).
  Calculs en centimes entiers (`lib/money.ts`) : prix × quantité et totaux exacts au centime.
  *Voir le devis* : brouillon **calculé par le serveur** (`/api/admin/invoices/preview`, le même calcul que
  l'enregistrement), avec **Modifier** (retour au panier) ou **Confirmer**. À la confirmation, le serveur refait le
  calcul et le compare au brouillon affiché : s'il diffère (prix changé entre-temps), rien n'est enregistré et le
  nouveau brouillon est affiché pour vérification. En modification, les prix qui ont changé depuis le devis
  d'origine sont listés (ancien → nouveau) avant d'enregistrer. Un devis confirmé est numéroté par mois
  (**D102026-001** : D, mois, année, puis rang dans le mois, à l'heure du Maroc ; les anciennes factures gardent
  leur n° F…), figé (prix recalculés et enregistrés côté serveur), ajouté à l'historique, et le panier repart à zéro.
  **En-tête officiel** : le devis s'écrit sur l'en-tête de la société (`assets/devis/entete.pdf`, copie
  `public/entete.svg` pour l'écran et l'impression), en A4 : logo et raison sociale en haut, coordonnées en bas de
  la feuille sur chaque page, même avec peu de produits ; le nom du client est sous « Client ».
  *Imprimer le devis* = confirmer puis imprimer (A4, seul le devis sort ; « Enregistrer en PDF » du navigateur pour
  un fichier). Seul un devis confirmé s'imprime.
  Devis confirmé : **Modifier** (il revient dans le panier, bandeau « Modification du devis … » ;
  l'enregistrement garde le même n° et note « Modifié le … »), **Partager PDF** (feuille de partage du
  téléphone : WhatsApp, e-mail… ; sur ordinateur : téléchargement du PDF) et **Imprimer**. Le PDF est généré
  côté serveur sur l'en-tête (`/api/admin/invoices/<id>/pdf`, `lib/invoice-pdf.ts`).
- **Raccourcis sous « Gestion »** (catalogue admin) : *Revendeurs et villes*, *Devis - Historique*, *PDF*.
- **PDF** (bouton « PDF » sous « Gestion », ou Gestion › PDF, `/admin/gestion/pdf`) : catalogues A4 à télécharger.
  1. Choisir le type :
     - *Catalogue de prix* : prix public seulement, aucune mention des revendeurs ;
     - *Catalogue des tarifs* : prix public + prix du revendeur choisi (son nom en « Client » en haut ;
       « — » pour un produit sans prix revendeur) ;
     - *Tarifs revendeurs - À valider* : prix public + case « Prix revendeur » vide à remplir à la main ;
       mode d'emploi et cases de validation après le dernier produit, « Visa direction » sur chaque page.
  2. Contenu : tout le catalogue, ou des marques / catégories / produits cochés (avec recherche).
  Seul le *Catalogue de prix* a une page de garde avec sommaire. Les deux autres n'en ont pas : le titre (logo,
  « Client : … » ou « à valider », date) est en haut de la première page et les produits commencent juste dessous ;
  puis les marques à la suite, sans saut de page (moins de papier) : chaque marque
  commence par son titre (logo, nom, nombre de produits), répété « (suite) » en haut de page ; une seule colonne
  large par page. Photo, nom, format, prix public (promotion barrée). Généré à la demande
  côté serveur (`POST /api/admin/catalogue`, `lib/catalogue-pdf.ts`) avec les prix et photos actuels de Shopify.
- **Gestion** (barre latérale, onglets en haut sur mobile) :
  - *Revendeurs et villes* (`/admin/gestion`, page d'arrivée) : « Prix Gros » en tête (lien vers ses prix) ;
    ajouter un revendeur (nom, ville ; il part des prix de « Prix Gros ») ; la liste affiche les noms avec
    **Modifier** et **Supprimer** (avec ses prix saisis ; ses devis restent) ; un clic sur le nom l'ouvre aussi en
    modification (nom, ville ; Échap annule) ; la poignée ⋮⋮ devant le nom se glisse (souris ou doigt, ou flèches
    ↑ ↓ au clavier) pour changer l'ordre, repris dans les listes déroulantes. Villes : grandes villes du Maroc (`lib/cities.ts`) ; une ville absente
    s'ajoute depuis la recherche (« + Ajouter ») ;
  - *Devis - Historique* (`/admin/gestion/factures`) : devis confirmés, chacun avec **Modifier** (retour au
    panier) et une petite icône **Imprimer** (impression directe sur l'en-tête) ; pour supprimer : cocher les devis (ou tout cocher), puis **Supprimer** ou **Annuler** dans la barre
    flottante en bas (confirmation demandée). Un devis supprimé quitte l'historique, mais la ligne reste en base
    (statut « supprime ») pour que son n° ne soit jamais redonné ; recherche (n°, revendeur,
    ville, produit), filtre par revendeur (liste avec recherche par nom ou ville, y compris les revendeurs supprimés), dates (du / au, aujourd'hui, 7 jours, ce mois), total ; ouvrir,
    réimprimer, partager en PDF ou **modifier** un devis ; **exporter** (Excel / CSV, selon les filtres) les
    devis (une ligne par devis) ou le détail (une ligne par produit) (modifier : retour au catalogue avec le devis dans le panier) ;
  - *Prix des produits* (`/admin/gestion/prix`) : choisir le revendeur (ou « Prix Gros »), puis saisie dans le tableau puis *Enregistrer* (champ vidé =
    pas de prix revendeur pour ce produit) ; **Exporter / Importer CSV** pour ce revendeur (colonne `prix_revendeur`, `prix_commercial` accepté pour les anciens fichiers,
    rattachement par `variant_id`, sinon par `sku` ; cellule vide = inchangé).

Tables : `price_options` (revendeurs, `base` = tarif de base), `option_prices` (prix saisis), `invoices` (devis confirmés), historique
des prix dans `commercial_price_history`.

## Personnaliser
- `lib/config.ts` : ordre des marques/catégories, alias de marques, règles collections → catégories.
- `app/globals.css` : couleurs et animations (variables en tête de fichier).
- Stockage des prix : `lib/prices.ts` expose seulement `getPrices` / `savePrices` ; changer de backend n'affecte pas l'UI.

## Structure
```
proxy.ts                 garde d'accès (/admin et /api/admin/* réservés à l'admin)
app/page.tsx             catalogue public (prix du site seulement)
app/admin/page.tsx       catalogue admin (tarif de base puis revendeur choisi, prix revendeurs, stock)
app/admin/gestion/       Gestion : revendeurs et villes ; prix/ : prix par revendeur ; factures/ (devis)
app/api/                 login, logout, admin/{options,prices,import,export,invoices,catalogue}
components/              Catalog, OptionsManager (revendeurs), Cart, Invoice, ProductCard (yeux + animation), AdminPrices…
lib/shopify.ts           requêtes GraphQL (sans cache : données toujours à jour)
lib/price-options.ts     revendeurs (nom, ville, ordre ; copie des prix de « Prix Gros » à la création)
lib/prices.ts, db.ts     prix saisis (Postgres, ou mémoire en démo)
lib/session.ts, auth.ts  JWT signé en cookie HttpOnly, code admin comparé en temps constant
```
