# Choix de la stack technique

Document Discovery — pourquoi ces outils, et pourquoi pas les autres.

---

## La contrainte qui décide de tout

Le brief impose un budget faible et interdit de réinventer la roue. Il laisse
le choix des outils « NoCode / LowCode ». Mais le domaine, lui, impose une
exigence que la plupart des outils no-code ne savent pas tenir :

> **Deux personnes ne doivent jamais pouvoir réserver la même salle au même
> moment, et un solde de crédits ne doit jamais être faux.**

Ce sont deux problèmes de **concurrence** et d'**intégrité transactionnelle**.
Ils ne se voient jamais en démonstration — ils se manifestent le jour où deux
membres cliquent à la même seconde. C'est ce critère, plus que la vitesse de
prototypage, qui a guidé le choix.

---

## Ce qui a été retenu

| Couche | Outil | En une phrase |
| :--- | :--- | :--- |
| Base de données | **Supabase** (PostgreSQL) | Le seul à offrir les garanties d'intégrité dont le métier a besoin |
| Authentification | **Supabase Auth** | Inclus, avec la RLS branchée dessus |
| Sécurité | **Row Level Security** | Les règles d'accès vivent dans la base, pas dans le code client |
| Temps réel | **Supabase Realtime** | Inclus, sans serveur à maintenir |
| Interface | **React + Vite + TypeScript** | Standard, rapide à construire, rapide à charger |
| Style | **Tailwind CSS** | Cohérence visuelle sans écrire de CSS |
| Hébergement | **Vercel** | Déploiement automatique à chaque `git push` |

**Coût d'infrastructure : 0 €.** Tout tient dans les paliers gratuits de
Supabase et Vercel, largement dimensionnés pour un coworking. C'était une
condition du brief.

---

## Pourquoi PostgreSQL était non négociable

Deux fonctionnalités du moteur portent à elles seules la fiabilité du produit.

**La contrainte `EXCLUDE`** interdit le double-booking au niveau du moteur, de
manière atomique. L'approche intuitive — vérifier puis insérer — laisse une
fenêtre de quelques millisecondes pendant laquelle deux réservations passent.
PostgreSQL sait exprimer nativement « ces deux lignes ne peuvent pas
coexister ». Aucun outil no-code ne propose cet équivalent.
Détail complet dans [`BTREE_GIST.md`](BTREE_GIST.md).

**Les transactions** garantissent qu'une réservation est *tout ou rien*.
Réserver, c'est six opérations : vérifier la salle, vérifier les fermetures,
vérifier le solde, créer la réservation, enregistrer les options, débiter les
crédits. Si la cinquième échoue, tout est annulé. Sans cette garantie, on
obtient des membres débités sans réservation, ou des réservations sans options.

---

## Les alternatives, et pourquoi elles ont été écartées

### Airtable + Softr

Le combo le plus rapide à monter, et le plus tentant pour un MVP.

**Écarté sur l'intégrité.** Airtable est une feuille de calcul collaborative :
pas de transactions, pas de contraintes d'exclusion, pas de verrous. Deux
réservations simultanées sur le même créneau passent toutes les deux. Le solde
de crédits, calculé par formule, dérive dès qu'une opération échoue à
mi-chemin. Sur une application dont le but explicite est de **supprimer les
conflits d'horaires**, c'est disqualifiant.

### Bubble

Techniquement capable de porter le produit, avec une vraie logique métier.

**Écarté sur trois points.** L'atomicité des workflows est difficile à garantir
et impossible à prouver ; le coût grimpe vite dès qu'on dépasse le palier
gratuit ; et le verrouillage propriétaire est total — le jour où Pacity veut
partir, il n'y a rien à emporter. Ici, le schéma et la logique sont du SQL
standard : ils survivent au changement d'hébergeur.

### Firebase

Bon Realtime, bonne authentification.

**Écarté sur le modèle de données.** Firestore est orienté document, sans
jointures ni contraintes multi-tables. Le domaine Pacity est relationnel de
part en part : membres, salles, réservations, options, transactions. Et les
règles d'intégrité devraient être réimplémentées à la main, sans garantie.

### Next.js plutôt que Vite

**Écarté parce qu'inutile ici.** Next.js apporte le rendu serveur et
l'optimisation du référencement. Or l'application est **entièrement derrière
une authentification** : aucune page n'a vocation à être indexée par Google.
On aurait payé en complexité pour un bénéfice nul. Vite construit en une
demi-seconde et sert un fichier statique — plus simple à comprendre, à
déployer et à reprendre.

---

## Ce que ce choix a coûté

Par honnêteté, il n'y a pas que des avantages.

- **Il faut savoir écrire du SQL.** Un outil no-code aurait été repris par
  n'importe qui ; ici, faire évoluer les règles métier demande de comprendre
  PL/pgSQL. C'est le prix des garanties.
- **Pas d'éditeur visuel pour le gérant.** Modifier un tarif ou ajouter une
  salle passe par l'interface d'administration qu'on a construite — ce qui
  existe déjà — mais changer une *règle* demande une migration.
- **Le premier jour est plus lent.** Monter un schéma, des contraintes et des
  RPC prend plus de temps que glisser-déposer des champs. Le rattrapage se fait
  ensuite, quand il n'y a aucun bug d'intégrité à traquer.

---

## Le mode de travail

L'ensemble a été piloté depuis **Claude Code**, connecté à Supabase et Vercel.
Concrètement : les migrations sont appliquées et versionnées dans le dépôt au
même moment, la base ne contient jamais de structure absente du code, et le
projet est reproductible depuis zéro.

C'est ce que le brief entend par *LowCode* : pas d'absence de code, mais
l'absence de tout ce qui n'apporte rien — pas de serveur à administrer, pas
d'API à écrire à la main, pas de pipeline de déploiement à construire.
