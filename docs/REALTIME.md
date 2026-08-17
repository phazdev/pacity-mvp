# Le temps réel — pourquoi une table témoin

Comment la grille d'une salle se met à jour toute seule quand quelqu'un d'autre
réserve, **sans jamais révéler qui a réservé quoi**.

---

## Ce qu'on veut obtenir

Pierre est sur la grille de la Medium Room, en train de sélectionner mardi 14h–16h.
Au même moment, Claire réserve mardi 15h depuis son poste. Sans rien faire, la grille
de Pierre doit se redessiner et afficher 15h en « Occupé » — sinon il valide une
réservation qui sera rejetée à la dernière seconde par la contrainte `EXCLUDE`.

---

## Le piège : Realtime applique la RLS

C'est le point contre-intuitif. On serait tenté de s'abonner directement à la table
`bookings` :

```js
// ⚠️ NE MARCHE PAS pour la grille
supabase.channel('grid')
  .on('postgres_changes', { event: '*', table: 'bookings' }, reload)
```

Sauf que la policy de `bookings` dit *« un membre ne voit que ses propres
réservations »*. Realtime respecte cette règle : **l'événement « Claire a réservé »
n'est jamais délivré à Pierre.** Sa grille resterait périmée indéfiniment, sans la
moindre erreur pour le signaler.

Et on ne peut pas simplement assouplir la policy : ce serait exposer à tous les
membres qui réserve quoi et quand — exactement ce que la décision « occupation
anonyme » interdit.

**Le blocage est donc réel :** l'information « ce créneau vient d'être pris » doit
circuler, mais l'information « c'est Claire qui l'a pris » ne doit pas.

---

## La solution : séparer le signal de la donnée

On dissocie les deux. Un **signal public** dit qu'il faut recharger ; la **donnée
sensible** ne transite que par la RPC, qui filtre selon le rôle.

```sql
create table public.room_schedule_events (
  room_id    uuid primary key references public.rooms(id) on delete cascade,
  changed_at timestamptz not null default now(),
  revision   bigint      not null default 1
);
```

Une ligne par salle. Trois colonnes. **Ni `user_id`, ni nom, ni horaire, ni montant.**
C'est ce qui autorise à la rendre lisible par tous les membres connectés sans rien
divulguer : il n'y a rien à divulguer.

Un trigger sur `bookings` et `room_closures` incrémente la révision de la salle
concernée :

```sql
insert into public.room_schedule_events (room_id) values (v_room)
on conflict (room_id) do update
  set changed_at = now(), revision = room_schedule_events.revision + 1;
```

---

## Le déroulé complet

```
Pierre : grille Medium Room ouverte          Claire : réserve mardi 15h
────────────────────────────────             ──────────────────────────
                                             create_booking(...)
                                                     ↓
                                             INSERT dans bookings
                                                     ↓
                                             trigger trg_bump_schedule_on_booking
                                                     ↓
                                             room_schedule_events
                                               Medium Room : revision 2 → 3
                                                     ↓
        Realtime pousse l'UPDATE  ←──────────────────┘
        payload : { room_id: "…", revision: 3 }
                                        ⚠️ rien d'autre
                 ↓
        « ma salle a bougé »
                 ↓
        get_room_schedule(medium, lundi, dimanche)
                 ↓
        La RPC renvoie « Occupé » (anonymisé, car Pierre est client)
                 ↓
        La grille se redessine : 15h passe en occupé ✅
```

**Les autres salles ne bougent pas.** La révision est incrémentée pour la seule salle
concernée : un membre qui regarde la Large Room n'est pas réveillé. Vérifié — une
modification sur la Medium Room laisse les trois autres à `revision = 1`.

---

## Les trois canaux, et ce que chacun couvre

| Canal | Table | Ce que ça met à jour | Pourquoi c'est sûr |
| :--- | :--- | :--- | :--- |
| Personnel | `profiles` | Le solde de crédits, en haut de l'écran | RLS : chacun ne reçoit que sa propre ligne |
| Personnel | `credit_transactions` | L'historique de crédits | RLS : idem |
| Personnel | `bookings` | « Mes réservations » — passage à `cancelled` quand le gérant annule | RLS : chacun ne reçoit que les siennes |
| Public | `room_schedule_events` | La grille d'occupation d'une salle | La table ne contient aucune donnée personnelle |

Les trois premiers exploitent la RLS **comme filtre** : elle fait exactement le travail
qu'on veut. Le quatrième existe précisément parce que ce filtre, sur la grille,
bloquerait l'information dont on a besoin.

---

## À respecter côté client

**Filtrer par salle.** Sans filtre, chaque réservation du coworking réveille tous les
clients connectés, quelle que soit la salle affichée.

```js
supabase.channel(`room-${roomId}`)
  .on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'room_schedule_events',
    filter: `room_id=eq.${roomId}`,
  }, () => refetchSchedule())
  .subscribe()
```

**Se désabonner au démontage** (`removeChannel`), sinon les abonnements s'accumulent
à chaque changement de salle et la grille se recharge en boucle.

**Ne rien lire dans le payload.** Il ne sert qu'à déclencher. Toute la donnée vient de
`get_room_schedule`, qui repasse par la RLS et l'anonymisation. Si un jour on est tenté
d'ajouter un champ utile à `room_schedule_events` pour « éviter un aller-retour », c'est
le moment de se rappeler pourquoi cette table est vide de sens métier.

**Rater un événement est sans conséquence.** La révision est un compteur, pas un flux
d'événements à rejouer : deux modifications rapprochées peuvent ne déclencher qu'un
seul rechargement, qui rattrape les deux. L'opération est idempotente.

---

## L'approche abandonnée

Les migrations 09 et 10 diffusaient via `realtime.send()`, qui écrit dans
`realtime.messages`. Cette table est partitionnée par jour et **n'avait aucune
partition** sur un projet neuf. Impossible d'en créer : le rôle `postgres` n'a pas
le privilège `CREATE` sur le schéma `realtime`, propriété de `supabase_admin`.

```sql
select has_schema_privilege('postgres', 'realtime', 'CREATE');  -- false
```

Le plus pernicieux : `realtime.send()` **attrape son exception en interne**. Aucune
erreur, aucun message délivré. Le diagnostic complet est en tête de la migration 11.

La table témoin vit dans `public`, dont on est propriétaire — aucune dépendance à un
service ou à un schéma qu'on ne contrôle pas.
