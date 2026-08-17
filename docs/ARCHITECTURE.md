# Architecture — Pacity MVP

Ce document explique **pourquoi** la base est faite ainsi. Le SQL exact vit dans
`supabase/migrations/`.

---

## Les quatre invariants

Tout le reste en découle. Si une modification future casse l'un d'eux, c'est une régression.

### 1. Le ledger fait foi

`credit_transactions` est **append-only** et constitue la seule source de vérité des
soldes. `profiles.credits` n'est qu'un cache, maintenu par le trigger `sync_credits`
sur `AFTER INSERT`. Personne n'écrit `profiles.credits` à la main.

Un trigger `reject_ledger_mutation` bloque tout `UPDATE` et tout `DELETE` sur le ledger :
pour corriger une erreur, on enregistre une transaction inverse. Le contrôle de
cohérence (`SUM(amount) == credits`) doit toujours passer.

> Le seul contournement légitime est la purge de `reseed.sql`, qui désactive
> temporairement le trigger.

### 2. Aucun double-booking n'est possible

Ce n'est pas un `SELECT` suivi d'un `INSERT` — un trigger de ce type laisse une
fenêtre de concurrence entre les deux. C'est une contrainte `EXCLUDE` :

```sql
exclude using gist (room_id with =, tstzrange(start_time, end_time) with &&)
  where (status = 'confirmed')
```

Le moteur la garantit de manière atomique. Deux transactions simultanées sur le même
créneau : la seconde échoue en `exclusion_violation`, que `create_booking` traduit en
message lisible. Même mécanisme sur `room_closures`.

### 3. Aucune écriture directe depuis le client

Les policies RLS n'accordent **que du SELECT** sur les tables transactionnelles.
Toute mutation passe par une RPC `SECURITY DEFINER` qui porte ses propres règles.
Réserver, c'est 6 opérations — les enchaîner depuis React laisserait des états
partiels (débité sans réservation, réservé sans options).

> C'est aussi pourquoi le linter Supabase signale « Signed-In Users Can Execute
> SECURITY DEFINER Function » sur nos RPC. **C'est intentionnel** : ces fonctions
> sont le point d'entrée voulu, et chacune vérifie ses propres droits.

### 4. Un paiement ne crédite jamais deux fois

`credit_transactions.order_id` porte un index unique. Même si `fulfill_order` est
appelée dix fois — ou si un webhook Stripe est rejoué — le crédit n'est passé qu'une
fois. Même principe pour la dotation mensuelle, via un index unique partiel sur
`(user_id, mois)`.

---

## Frontière du paiement

```
Choix du pack  →  create_order()  →  status 'pending'
                          ↓
              Page « Valider le paiement »
                          ↓
    AUJOURD'HUI          |         DEMAIN
    le bouton appelle    |    Stripe Checkout → webhook
    fulfill_order()      |    → fulfill_order()
                          ↓
        status 'paid' + entrée au ledger + solde à jour
```

`fulfill_order` est le **seul** endroit qui crédite une commande. Brancher un vrai
paiement se limite à : rediriger vers Stripe Checkout au lieu d'appeler la fonction
directement, et ajouter une Edge Function webhook qui l'appelle en `service_role`
(la fonction accepte `auth.uid()` nul, précisément pour ce cas). Schéma, ledger,
soldes et historique : rien à toucher.

---

## Temps réel

Realtime **applique la RLS**. C'est une bonne chose pour les données personnelles, et
un piège pour la grille.

> 📖 Explication détaillée, avec le déroulé complet et les règles côté client :
> **[`REALTIME.md`](REALTIME.md)**.

**Données personnelles — `postgres_changes`.** Les tables `profiles`,
`credit_transactions` et `bookings` sont publiées. Chaque membre ne reçoit que ses
propres événements, la RLS s'en charge. C'est ce qui fait remonter le solde en direct
et basculer une réservation en « annulée » quand le gérant intervient.

**Agenda des salles — table témoin.** Un client ne peut pas lire les réservations des
autres, donc il ne recevrait **jamais** l'événement « Claire a réservé mardi 14h » :
sa grille resterait périmée. On passe donc par `room_schedule_events`, une ligne par
salle contenant uniquement `room_id`, `changed_at` et `revision`. Un trigger sur
`bookings` et `room_closures` incrémente la révision de la salle concernée. La table
ne contenant **aucune donnée personnelle**, elle peut être lisible par tous les
membres sans rien divulguer. Le client la surveille et recharge `get_room_schedule`,
qui réapplique l'anonymisation.

> **Pourquoi pas `realtime.send()` ?** C'était l'approche des migrations 09/10.
> Elle écrit dans `realtime.messages`, partitionnée par jour — et aucune partition
> n'existait. Impossible d'en créer : `postgres` n'a pas le privilège `CREATE` sur le
> schéma `realtime`. Pire, `realtime.send()` avale son exception : les messages
> disparaissaient sans la moindre erreur. La migration 11 documente le diagnostic.

## Règles métier

| Règle | Valeur | Où c'est appliqué |
| :--- | :--- | :--- |
| Droit de réserver | Solde ≥ coût. **L'abonnement n'entre pas en compte** | `create_booking` |
| Dotation mensuelle | Full Time 20 cr · Nomad 0 | `subscription_plans` |
| Cumul des crédits | Illimité, aucune expiration | — |
| Horaires | 8h → 20h, lundi–vendredi | `assert_bookable_slot` |
| Granularité | Heures pleines, même journée, 8h consécutives max | `assert_bookable_slot` |
| Horizon | 30 jours, jamais dans le passé | `create_booking` |
| Annulation | **Gérant uniquement**, remboursement intégral | `cancel_booking` |
| Fuseau | Tout est évalué en `Europe/Paris` | partout |

**Le NOMAD respecte le brief sans règle dédiée** : il démarre à 0 crédit, donc il ne
peut rien réserver. S'il achète un pack, il peut réserver — ce qui rend la vente de
packs cohérente. Une seule règle au lieu de deux.

Pour ouvrir le week-end ou changer les horaires : modifier `assert_bookable_slot`
(migration 03) et la constante correspondante côté front.

---

## Référence des RPC

| Fonction | Qui | Effet |
| :--- | :--- | :--- |
| `get_room_schedule(room, from, to)` | Membre | Occupation d'une salle. **Anonymisée** : « Occupé » pour un client, nom réel pour le gérant |
| `create_booking(room, start, end, options[])` | Membre | Valide, débite, réserve — atomique |
| `cancel_booking(booking, motif)` | Gérant | Annule + rembourse |
| `close_room(room, start, end, motif)` | Gérant | Ferme, annule et rembourse l'existant. Renvoie le nombre de réservations touchées |
| `create_order(kind, pack?)` | Membre | Commande `pending`. `kind` = `CREDIT_PACK` \| `SUBSCRIPTION` |
| `fulfill_order(order, ref?)` | Membre / webhook | Encaisse et crédite. Idempotent |
| `run_monthly_renewal()` | Gérant / cron | Dotation mensuelle. Idempotent. Renvoie le nombre de versements |
| `admin_adjust_credits(user, montant, motif)` | Gérant | Geste commercial ou correction |

`get_room_schedule` mérite une explication : avec la RLS, un client ne lit que ses
propres réservations — il ne peut donc pas savoir qu'un créneau est pris par
quelqu'un d'autre, et tenterait de réserver dans le vide. Cette fonction expose
l'occupation **sans** l'identité. C'est elle que le calendrier doit interroger, pas
la table `bookings`.

---

## Photos de salle

`rooms.image_url` accepte indifféremment un **chemin relatif** servi par
l'application (`/rooms/medium-room.jpg`, ce qu'on fait aujourd'hui) ou une
**URL absolue**. Le jour où le gérant pourra téléverser ses propres photos via
Supabase Storage, aucune migration de schéma ne sera nécessaire : seule la
valeur change. `NULL` est autorisé — une salle créée sans photo affiche un
aplat neutre plutôt qu'une image cassée.

Les sources sont livrées dans `Photos/` et les versions optimisées dans
`public/rooms/` (688 Ko au total, chargement différé). Leurs formats restent
hétérogènes — 1200×825 paysage pour la Medium Room, 960×1200 **portrait** pour
le Phone Booth — d'où un ratio imposé avec `object-cover` : on recadre
proprement au lieu de déformer.

> **Le script d'optimisation ne doit jamais agrandir.** `sips -Z 1200` upscale
> les images plus petites que la cible, ce qui dégrade *et* alourdit. La boucle
> teste donc la dimension maximale et ne redimensionne que si elle dépasse.

La page d'une salle utilise une **vignette** et non une bannière pleine
largeur. Ce n'est plus une question de résolution : c'est pour qu'on atteigne
la grille de réservation sans faire défiler une grande image, en particulier
sur mobile.

Le choix de servir les images depuis l'application plutôt que depuis Supabase
Storage est **assumé pour le MVP** : zéro infrastructure supplémentaire, mais
changer une photo impose un redéploiement. Le passage à Storage — qui rendrait
la gestion des photos autonome pour le gérant — est listé en piste d'upsell.

## Tarifs

| Produit | Crédits | Prix | €/crédit |
| :--- | ---: | ---: | ---: |
| Pack Découverte | 5 | 15 € | 3,00 |
| Pack Régulier | 10 | 25 € | 2,50 |
| Pack Intensif | 20 | 45 € | 2,25 |
| **Full Time** | 20/mois | 39 €/mois | **1,95** |

La dégressivité rend l'abonnement visiblement plus avantageux que le pack équivalent.

---

## Écarts assumés vs `complement.md`

| Le complément prévoyait | Retenu | Pourquoi |
| :--- | :--- | :--- |
| Table `users` avec UUID propre | `profiles.id` → `auth.users(id)` | Sinon `auth.uid()` ne correspond à rien et la RLS annoncée est décorative |
| `credits` en colonne autonome | Cache dérivé du ledger | Deux sources de vérité divergent toujours |
| Anti-chevauchement par trigger | Contrainte `EXCLUDE` | Le trigger laisse une race condition |
| Écritures depuis le client | RPC transactionnelles | 6 opérations non atomiques = états partiels |
| `ON DELETE CASCADE` sur l'historique | `RESTRICT` + archivage | Supprimer une salle effaçait les réservations en laissant les débits orphelins |
| `is_available` booléen seul | + `room_closures` datées | Le brief demande travaux/fuite/privatisation, qui sont datés |
