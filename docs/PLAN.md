# Plan & avancement — Pacity MVP

Document vivant. À mettre à jour à chaque étape franchie, pour pouvoir reprendre
le projet sans rien reconstruire.

**Dernière mise à jour : 17/08/2026**

---

## Où on en est

| Phase | État |
| :--- | :--- |
| 1 — Base de données | ✅ **Terminée et vérifiée** (18 tests passés) |
| 2 — Application React | ✅ **Fonctionnelle**, parcours vérifiés en navigateur |
| 3 — Livrables Discovery & Upsell | ⬜ À faire |

---

## Décisions actées

Ne pas les remettre en cause sans raison — elles ont été arbitrées avec le client.

| Sujet | Décision |
| :--- | :--- |
| Auth | Supabase Auth (email/mot de passe) + RLS réelle |
| Droit de réserver | **Solde de crédits**, pas le type d'abonnement |
| Annulation | **Gérant uniquement**, remboursement systématique |
| Renouvellement | `pg_cron` mensuel + bouton admin de forçage, idempotent |
| Créneaux | Heures pleines, 8h–20h, lun–ven, 30 j d'horizon |
| Calendrier | Grille semaine par salle : l'occupé est affiché, le vide est cliquable |
| Confidentialité | Client → « Occupé » anonyme · Gérant → noms visibles |
| Fermetures | `room_closures` datées + motif, remboursement auto |
| Paiement | Simulé, architecturé pour brancher Stripe sans refonte |
| Packs | 5 cr = 15 € · 10 cr = 25 € · 20 cr = 45 € · Full Time 39 €/mois |
| Abonnement | Passage NOMAD → FULL_TIME en self-service, même tunnel |
| Livrables | Produit d'abord, puis roadmap + stack + kickoff + upsell |

### Arbitrages Phase 2

| Sujet | Décision |
| :--- | :--- |
| Inscription | Ouverte. Nouveau compte en NOMAD à 0 crédit → ne peut rien réserver avant d'acheter. **Confirmation email désactivée** pour la démo |
| Annulation par le membre | **Non** — on maintient gérant seul. Remonte en piste d'upsell |
| Point d'entrée réservation | La grille. Le clic sur un créneau libre fixe salle + jour + heure ; ne restent que durée et options |
| Temps réel | Rechargement après action **+** Realtime (voir `ARCHITECTURE.md`) |
| Design | Chaleureux et soigné — cohérent avec le positionnement « cadre sympa et bienveillant » |
| Déploiement | Local, puis Vercel une fois l'app stable |

> ⚠️ **Action manuelle requise dans le tableau de bord Supabase** :
> Authentication → Sign In / Providers → Email → désactiver **Confirm email**.
> Sans ça, tout compte créé via le formulaire reste bloqué en attente de validation.

---

## Phase 1 — Base de données ✅

Huit migrations appliquées sur `vujzhlylcwpnqpidjfyd`, toutes versionnées dans
`supabase/migrations/`.

| # | Migration | Contenu |
| :-- | :--- | :--- |
| 01 | `extensions_and_core_tables` | `btree_gist`, `profiles`, `rooms`, `options`, `room_options` |
| 02 | `bookings_orders_ledger` | `bookings` (+ `EXCLUDE`), `booking_options`, `room_closures`, `credit_packs`, `orders`, `credit_transactions` + index d'idempotence |
| 03 | `helpers_and_triggers` | `subscription_plans`, `is_admin`, `sync_credits`, ledger append-only, `handle_new_user`, `assert_bookable_slot` |
| 04 | `business_functions` | Les 8 RPC métier |
| 05 | `rls_policies` | RLS sur 11 tables, grants/revokes |
| 06 | `seed_data` | 4 comptes Auth, catalogue, réservations, fermeture |
| 07 | `cron_monthly_renewal` | `pg_cron` le 1er du mois à 00:05 UTC |
| 08 | `advisor_fixes` | `search_path`, `(select auth.uid())`, policies dédoublonnées |

### Vérifications passées

Toutes rejouées en simulant de vraies sessions authentifiées (`request.jwt.claims`).

**Sécurité et intégrité** — solde insuffisant refusé · double-booking bloqué par la
contrainte `EXCLUDE` · annulation par un client refusée · `UPDATE` du ledger refusé ·
`fulfill_order` × 3 = un seul crédit · renouvellement rejoué dans le mois = 0 versement ·
remboursement à l'annulation cohérent · `SUM(ledger) == credits` sur les 4 comptes.

**Règles de créneaux** — bloqués : week-end, 7h, 20h–21h, créneau passé, au-delà de
30 jours, plus de 8h consécutives, demi-heure, salle fermée pour travaux, option non
proposée dans la salle.

**Linter Supabase** — zéro `WARN` en performance. Les `WARN` de sécurité restants
(« Signed-In Users Can Execute SECURITY DEFINER Function ») sont **voulus** : voir
`ARCHITECTURE.md`, invariant n°3.

---

## Phase 2 — Application React ✅

Stack : `Vite + React 19 + TypeScript + Tailwind 4 + React Router 7 + @supabase/supabase-js`

`npm install && npm run dev` → http://localhost:5173

### Parcours vérifiés en navigateur

Connexion Sophie (Nomad, 0 crédit) → tableau de bord vide avec relance d'achat →
grille Medium Room affichant « Occupé » **anonymisé** et la fermeture hachurée →
achat Pack Régulier 25 € → checkout simulé → solde 0 → 10 →
réservation mercredi 9h–11h + vidéoprojecteur (8 crédits) → solde 10 → 2 →
connexion Mathieu → **7 réservations de tous les membres avec leurs noms** →
annulation motivée → remboursement → Sophie de retour à 10, ledger cohérent.

Vérifié aussi : durée plafonnée à 5h depuis 9h le mercredi (la fermeture démarre à
14h), options limitées à celles de la salle, zéro erreur console.

### Bug corrigé pendant la vérification

`bookings` référence `profiles` deux fois (`user_id` et `cancelled_by`) : PostgREST
refusait la jointure avec « more than one relationship was found ». Corrigé en
nommant la contrainte — `profiles!bookings_user_id_fkey`.

### Migration ajoutée

`13_delete_closure` — lever une fermeture. `close_room()` n'avait pas d'inverse :
une erreur de saisie du gérant bloquait la salle définitivement.

```
src/
  lib/          supabase.ts · constantes métier (horaires, tarifs)
  hooks/        useAuth · useProfile · useRoomSchedule
  components/   WeekGrid · RoomCard · OptionPicker · CreditBadge
  pages/
    client/     Rooms · RoomBooking · MyBookings · Credits · Checkout
    admin/      Dashboard · Bookings · Rooms · Members
```

### Écran central — `RoomBooking`

Grille 5 jours × 12 heures pour une salle. Fonctionne « à l'envers » : on affiche
l'occupation, et **le vide est réservable**.

- Blocs pleins sur les créneaux pris (via `get_room_schedule`, jamais via `bookings`)
- Hachures + motif sur les fermetures
- Grisé non cliquable : passé, hors 8h–20h, week-end
- Sélection au clic puis extension pour plusieurs heures consécutives
- Panneau latéral : options disponibles **pour cette salle**, coût calculé en direct
- Navigation `←` `→` entre semaines

### Livré

- [x] Vite + Tailwind + Router, `.env.local` branché
- [x] Auth : connexion **et inscription**, session persistante, garde de route par rôle
- [x] Liste des salles avec caractéristiques et options réellement proposées
- [x] `WeekGrid` + tunnel de réservation (durée, options, coût en direct)
- [x] Tableau de bord : onglets À venir / Passées / Annulées, tuiles de synthèse
- [x] Solde + historique complet du ledger
- [x] Tunnel d'achat : packs, abonnement, checkout simulé avec badge assumé
- [x] Vue gérant : toutes les réservations avec noms, annulation motivée, fermetures
      datées, crédit manuel, bouton « Forcer le renouvellement mensuel »
- [x] Realtime : solde, ledger, mes réservations, grille par salle

### Déploiement ✅

**https://pacity-mvp.vercel.app** — projet `pacity-mvp`, team PHAZDEV.
Redéploiement : `npm run build && npx vercel deploy --prod --yes`.

> Le MCP Vercel exige de transmettre le contenu de tous les fichiers dans
> l'appel ; 110 Ko de sources ne passent pas. Le CLI, qui lit le dossier
> depuis le disque, est la bonne voie pour ce projet.

### Responsive mobile ✅ — vérifié en viewport 390 px réel

L'outil de redimensionnement du navigateur ne change pas le viewport de rendu
(`window.innerWidth` restait à 1920 malgré un « success »). Contournement qui
fonctionne : **charger l'app dans une iframe de 390 px de large** — c'est un
vrai viewport, les media queries s'appliquent réellement.

Quatre défauts trouvés et corrigés :

1. **Badge de crédits masqué sous 640px** (`hidden sm:block`) — c'était
   pourtant l'information n°1 attendue par le membre. Toujours visible
   désormais, en version compacte (le nombre seul).
2. **Barre de navigation en débordement** : 4 libellés + solde + nom +
   déconnexion sur une ligne. Passe sur une seconde ligne défilante.
3. **La page entière débordait horizontalement** au lieu de la seule grille.
   Cause : un enfant de grille CSS a `min-width:auto`, donc le
   `min-w-[640px]` de la grille horaire forçait la colonne à 640px.
   Corrigé par `min-w-0` sur la carte. Les flèches ← → de navigation entre
   semaines, poussées hors écran, sont revenues au passage.
4. **Toucher un créneau ne produisait aucun effet visible** : le panneau est
   sous la grille sur mobile. Défilement automatique ajouté — avec deux
   subtilités : un délai de 120 ms (sinon le recentrage du focus navigateur
   annule l'animation) et un **repli en défilement instantané**, car
   `behavior:'smooth'` est purement ignoré dans certains contextes
   (`prefers-reduced-motion`, iframe non focalisée) sans lever d'erreur.

Vérifié après correction : `scrollWidth === clientWidth` (aucun débordement),
flèches visibles, panneau amené à l'écran (`scrollY 1075`, panneau visible),
durées correctement plafonnées, alerte de solde insuffisant lisible.

---

## Phase 3 — Livrables Discovery & Upsell ⬜

20 % de la note du cas. Un artifact web partageable regroupant :

- [ ] Roadmap projet
- [ ] Justification de la stack technique
- [ ] Schéma de données commenté
- [ ] Kickoff deck
- [ ] Pistes d'upsell chiffrées

**Pistes d'upsell identifiées en cours de build** — l'annulation self-service (le
gérant est aujourd'hui un goulot d'étranglement, friction assumée du MVP), les
réservations récurrentes hebdomadaires, le vrai paiement Stripe (l'architecture est
déjà prête, ce qui rend le devis crédible), les rapports d'occupation par salle, le
check-in par QR code, les notifications de rappel.

---

## Hors périmètre

Paiement réel, notifications email, récurrences, résiliation d'abonnement,
application mobile, calendrier multi-salles simultané.
