# Pacity MVP — contexte projet

Cas d'étude : application de réservation de salles pour le coworking Pacity.
Brief client dans `brief.md`, complément d'architecture initial dans `complement.md`.

## À lire en premier

| Fichier | Pour quoi |
| :--- | :--- |
| `docs/PLAN.md` | État d'avancement et reste à faire. **Le mettre à jour à chaque étape franchie.** |
| `docs/ARCHITECTURE.md` | Les 4 invariants de la base, la référence des RPC, les écarts assumés vs `complement.md` |
| `docs/BTREE_GIST.md` | Pourquoi l'anti-double-booking est une contrainte `EXCLUDE` et pas un trigger. À lire avant de toucher aux contraintes de `bookings` ou `room_closures` |
| `docs/REALTIME.md` | Pourquoi la grille passe par la table témoin `room_schedule_events` et pas par un abonnement à `bookings`. À lire avant de toucher aux abonnements |
| `README.md` | Comptes de démo, opérations courantes |

## Stack et environnements

Supabase (PostgreSQL + Auth + RLS) · React + Vite + TypeScript + Tailwind.

| | |
| :--- | :--- |
| Supabase | `vujzhlylcwpnqpidjfyd`, piloté via le MCP Supabase du compte |
| En ligne | https://pacity-mvp.vercel.app (team Vercel PHAZDEV) |
| Redéployer | `npm run build && npx vercel deploy --prod --yes` |
| Dépôt git | Initialisé et commité en local. **Pas encore poussé sur GitHub** |

**Ne pas utiliser `deploy_to_vercel` (MCP) sur ce projet** : il exige de
transmettre le contenu de chaque fichier dans l'appel, et 110 Ko de sources ne
passent pas — le résultat est un arbre tronqué et un build cassé. Le CLI lit le
dossier depuis le disque, sans cette limite.

Une fois le dépôt poussé sur GitHub, préférer `create_git_project` (MCP Vercel) :
il lie le projet au dépôt, et Vercel redéploie alors **automatiquement à chaque
push**. Plus aucune commande de déploiement à lancer.

## Règles de travail sur ce projet

**Toute modification de schéma passe par `apply_migration`, et le SQL est
systématiquement recopié dans `supabase/migrations/`** avec le même horodatage.
La base ne doit jamais contenir de DDL absent du dépôt — sinon le projet n'est plus
reproductible.

**Ne pas contourner les invariants** décrits dans `ARCHITECTURE.md` :
le ledger fait foi, l'anti-chevauchement est une contrainte `EXCLUDE`, aucune écriture
directe depuis le client, un paiement ne crédite jamais deux fois. Une régression sur
l'un d'eux casse la démonstration.

**Le calendrier lit `get_room_schedule`, jamais la table `bookings`.**
La RLS empêche un client de voir les réservations des autres ; cette RPC expose
l'occupation sans l'identité. Interroger `bookings` directement donnerait une grille
qui paraît vide alors que les créneaux sont pris.

**Après toute migration**, lancer `get_advisors` (security + performance). Les seuls
avertissements tolérés sont « Signed-In Users Can Execute SECURITY DEFINER Function »
(intentionnel) et les `INFO` « unused index ».

**Les constantes métier ne sont pas en dur dans les composants** : horaires
d'ouverture, tarifs et durées vivent dans `src/lib/`, en miroir de
`assert_bookable_slot` et `subscription_plans`.

## Décisions déjà arbitrées avec le client

Voir le tableau dans `docs/PLAN.md`. Les deux plus structurantes :

- **Le droit de réserver dépend du solde, pas de l'abonnement.** Un Nomad ne peut rien
  réserver parce qu'il a 0 crédit, pas à cause d'une règle dédiée. S'il achète un pack,
  il peut réserver.
- **Seul le gérant annule**, toujours avec remboursement intégral. C'est conforme au
  brief ; la friction que cela crée est assumée et remonte en piste d'upsell.
