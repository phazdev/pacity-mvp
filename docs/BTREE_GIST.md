# Pourquoi `btree_gist` — l'anti-double-booking expliqué

C'est la pièce la moins évidente de la base, et la plus importante. Ce document
explique le problème, pourquoi la solution intuitive ne marche pas, et comment
celle retenue fonctionne.

---

## Le problème

Une salle ne peut accueillir qu'une réunion à la fois. Il faut donc interdire toute
réservation qui **chevauche** une réservation existante **sur la même salle**.

Deux conditions, de natures très différentes :

| Condition | Opérateur | Nature |
| :--- | :--- | :--- |
| Même salle | `=` | égalité sur un `uuid` |
| Créneaux qui se chevauchent | `&&` | chevauchement de plages temporelles |

Toute la difficulté vient de là : ces deux opérateurs relèvent de deux familles
d'index différentes.

---

## Pourquoi la solution intuitive est fausse

Le réflexe naturel est un trigger :

```sql
-- ⚠️ CE CODE EST FAUX — ne pas l'utiliser
if exists (
  select 1 from bookings
  where room_id = new.room_id
    and new.start_time < end_time
    and new.end_time > start_time
    and status = 'confirmed'
) then
  raise exception 'Créneau déjà pris';
end if;
```

Ça a l'air correct, et ça marche parfaitement… tant qu'une seule personne réserve à
la fois. Voici ce qui se passe quand deux membres cliquent en même temps :

```
         Pierre (transaction A)              Claire (transaction B)
         ─────────────────────               ──────────────────────
t=0      BEGIN
t=1      SELECT … → 0 ligne
t=2                                          BEGIN
t=3                                          SELECT … → 0 ligne   ← ne voit pas
t=4      INSERT (Medium, 14h-16h)                                    A, non commitée
t=5                                          INSERT (Medium, 14h-16h)
t=6      COMMIT  ✅
t=7                                          COMMIT  ✅

         Résultat : DEUX réservations sur le même créneau.
```

En isolation `READ COMMITTED` — le niveau par défaut de PostgreSQL et de Supabase —
la transaction B **ne peut pas voir** la ligne insérée par A tant que A n'a pas
commité. Les deux vérifications passent, les deux insertions réussissent.

La fenêtre est de quelques millisecondes. Elle ne se manifestera jamais pendant tes
tests, et se manifestera le jour où deux personnes réservent la dernière Large Room
disponible. C'est exactement le type de bug qu'on ne veut pas découvrir en production.

Les contournements possibles — passer en `SERIALIZABLE`, poser un `LOCK TABLE`, ou un
verrou consultatif — fonctionnent mais **sérialisent toutes les réservations du
coworking**, y compris celles qui concernent des salles différentes.

---

## La solution : une contrainte `EXCLUDE`

PostgreSQL sait exprimer nativement « ces deux lignes ne peuvent pas coexister » :

```sql
constraint bookings_no_overlap exclude using gist (
  room_id                              with =,
  tstzrange(start_time, end_time)      with &&
) where (status = 'confirmed')
```

Ça se lit : *« il est interdit qu'il existe deux lignes confirmées dont les `room_id`
sont **égaux** ET dont les plages horaires se **chevauchent** »*.

Le contrôle est effectué par le moteur, à l'intérieur de l'index, **sous verrou**.
Rejouons le scénario :

```
         Pierre (transaction A)              Claire (transaction B)
         ─────────────────────               ──────────────────────
t=4      INSERT → pose une entrée d'index
t=5                                          INSERT → détecte le conflit,
                                                      SE MET EN ATTENTE 🔒
t=6      COMMIT  ✅
t=7                                          ❌ ERREUR 23P01
                                                exclusion_violation

         Résultat : une seule réservation. Toujours.
```

Il n'y a plus de fenêtre : la détection et l'insertion sont la même opération
atomique. Et le verrou ne porte que sur les entrées d'index en conflit — deux
réservations sur des salles différentes ne se bloquent jamais entre elles.

---

## Là où `btree_gist` intervient

Une contrainte `EXCLUDE` s'appuie sur un index **GiST** (*Generalized Search Tree*).
GiST est conçu pour les questions du type « est-ce que ça se chevauche ? »,
« est-ce que ça contient ? » — géométrie, plages, recherche plein texte. Les types
`range` de PostgreSQL savent nativement s'indexer en GiST : la moitié `&&` de notre
contrainte fonctionne d'emblée.

Le problème vient de l'autre moitié. `room_id` est un `uuid`, et l'opérateur `=` sur
un scalaire, c'est le territoire de **B-tree**, pas de GiST. Sans extension :

```
ERROR: data type uuid has no default operator class
       for access method "gist"
```

Or une contrainte `EXCLUDE` ne peut reposer que sur **un seul index**. Impossible d'en
combiner un B-tree pour `room_id` et un GiST pour la plage.

**`btree_gist` comble exactement ce vide** : l'extension fournit des classes
d'opérateurs GiST pour les types habituellement indexés en B-tree — `uuid`, `int`,
`text`, `timestamptz`, `bool`… Une fois installée, `uuid` devient indexable en GiST,
et les deux colonnes peuvent cohabiter dans le même index.

```
Sans btree_gist                    Avec btree_gist
───────────────                    ───────────────
room_id  →  B-tree ┐               room_id  →  GiST ┐
                   ├─ incompatible                  ├─ un seul index ✅
plage    →  GiST   ┘               plage    →  GiST ┘
```

C'est tout ce que fait l'extension. Elle n'ajoute aucune logique métier : elle rend
simplement compatibles deux mondes d'indexation qui ne l'étaient pas.

---

## Deux détails qui comptent

### Les bornes `[)` autorisent les créneaux qui s'enchaînent

`tstzrange(start, end)` produit par défaut une plage **`[)`** : borne de début
incluse, borne de fin **exclue**.

```
Réservation A : [09:00, 10:00)
Réservation B : [10:00, 11:00)

A && B  →  false   ✅ elles ne se chevauchent pas
```

C'est précisément le comportement voulu : deux réunions consécutives sur la même
salle sont légitimes. Avec des bornes fermées `[]`, 10:00 appartiendrait aux deux
plages et la seconde réservation serait refusée — la grille deviendrait inutilisable
dès qu'on enchaîne deux créneaux.

### Le `WHERE (status = 'confirmed')` rend l'index partiel

Seules les réservations confirmées occupent le créneau. Une réservation annulée sort
automatiquement de l'index : la salle redevient réservable, sans avoir à supprimer
quoi que ce soit. C'est ce qui permet le cycle *annulation par le gérant → le membre
peut re-réserver le créneau*, tout en conservant la ligne annulée dans l'historique.

---

## En pratique

**L'erreur remontée par PostgreSQL** porte le SQLSTATE `23P01`
(`exclusion_violation`). `create_booking` l'intercepte et la retraduit :

```sql
exception when exclusion_violation then
  raise exception 'Ce creneau vient d etre reserve par quelqu un d autre.';
```

Le front n'a donc jamais à afficher un message Postgres brut.

**L'index sert deux fois.** Ce n'est pas seulement un garde-fou : c'est un vrai index,
utilisé par le planificateur pour les requêtes filtrant sur `room_id` + intervalle de
temps — soit exactement ce que fait `get_room_schedule` à chaque affichage de la grille.

**Le même mécanisme protège `room_closures`** : impossible d'enregistrer deux
fermetures qui se chevauchent sur une même salle.

**Si tu modifies la contrainte** (par exemple pour autoriser une salle à accueillir
plusieurs réservations simultanées, ou pour ajouter une colonne), garde en tête que
`EXCLUDE` ne fonctionne qu'avec des opérateurs disposant d'une classe GiST. Pour
tout type scalaire nouveau, vérifie qu'il est couvert par `btree_gist`.

---

## Pour aller plus loin

- [Contraintes `EXCLUDE`](https://www.postgresql.org/docs/current/ddl-constraints.html#DDL-CONSTRAINTS-EXCLUSION)
- [Types `range` et opérateurs](https://www.postgresql.org/docs/current/rangetypes.html)
- [Extension `btree_gist`](https://www.postgresql.org/docs/current/btree-gist.html)
