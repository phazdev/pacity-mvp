# Roadmap projet

Document Discovery — ce qui a été livré, et dans quel ordre la suite se construit.

---

## Principe de séquencement

Une règle a guidé l'ordre : **construire d'abord ce qui est coûteux à corriger
plus tard.** Le schéma de base et les garanties d'intégrité viennent en
premier, parce qu'une erreur à ce niveau contamine tout ce qui est bâti
au-dessus. L'interface, elle, se refait en une journée.

C'est pourquoi la base de données a été terminée **et vérifiée** avant qu'une
seule ligne de React ne soit écrite.

---

## Livré — le MVP

### Sprint 0 · Cadrage

Lecture du brief, identification des trous, arbitrage avec le client sur onze
décisions structurantes. Les deux plus déterminantes :

- **Le droit de réserver dépend du solde, pas de l'abonnement.** Un Nomad ne
  peut rien réserver parce qu'il a zéro crédit — pas à cause d'une règle
  dédiée. S'il achète un pack, il peut réserver. Une seule règle au lieu de
  deux, et la vente de crédits devient cohérente.
- **Seul le gérant annule**, toujours avec remboursement intégral. Conforme au
  brief ; la friction que cela crée est assumée et remonte en piste d'upsell.

### Sprint 1 · Fondations de données

14 migrations. Quatre invariants qui portent la fiabilité du produit :
le ledger fait foi, l'anti-chevauchement est une contrainte moteur, aucune
écriture directe depuis le client, un paiement ne crédite jamais deux fois.

**18 vérifications passées** avant de passer à la suite : double-booking
bloqué, solde insuffisant refusé, ledger non modifiable, paiement rejoué sans
double crédit, renouvellement mensuel idempotent, règles d'horaires appliquées.

### Sprint 2 · Application

Inscription et connexion, tableau de bord adapté au rôle, grille de
réservation par salle, tunnel d'achat de crédits et d'abonnement, espace de
gestion pour le gérant. Temps réel sur le solde, l'historique et l'agenda.

Parcours vérifié de bout en bout dans un vrai navigateur, puis en viewport
mobile réel.

### Sprint 3 · Mise en ligne et livrables

Déploiement continu : chaque `git push` publie en production. Documentation
d'architecture, roadmap, justification de stack, pistes d'upsell.

---

## Prochaine étape — V1

Par ordre de priorité. Les trois premières se justifient seules ; les suivantes
gagnent à être décidées à partir des données d'usage.

| Rang | Chantier | Pourquoi maintenant | Effort |
| ---: | :--- | :--- | :--- |
| 1 | **Annulation self-service** | Le gérant est aujourd'hui un goulot d'étranglement. C'est la friction la plus visible du MVP | ~1 j |
| 2 | **Paiement réel (Stripe)** | L'architecture est déjà prête : il ne manque que la couche de paiement | ~2 j |
| 3 | **Notifications de rappel** | Réduit les créneaux occupés puis désertés | ~2 j |
| 4 | **Rapports d'occupation** | Alimente toutes les décisions suivantes — tarifs, horaires, investissement | ~3 j |
| 5 | **Réservations récurrentes** | Forte demande dès qu'une équipe a un rituel hebdomadaire | ~3 j |

**La 4 conditionne les décisions commerciales.** Sans données d'occupation,
choisir une grille tarifaire d'heures creuses ou justifier l'ouverture d'une
salle relève de l'intuition. C'est le chantier qui rend les autres pertinents.

---

## Ensuite — V2

Ces chantiers supposent que le produit a trouvé son usage. Les engager plus tôt
serait construire sur des hypothèses.

- **Check-in par QR code** — confirme la présence et libère automatiquement les
  créneaux non honorés
- **Tarification différenciée** — heures creuses moins chères, pour lisser
  l'occupation. Exige les rapports du rang 4
- **Comptes entreprise** — facturation groupée, budgets par équipe,
  gestionnaire délégué. C'est le levier B2B du coworking
- **Multi-site** — si Pacity ouvre un second espace, le schéma est déjà
  compatible : il manque une entité `site` et un filtre
- **Application mobile** — seulement si l'usage mobile le justifie. L'interface
  web est déjà responsive

---

## Ce qui reste ouvert sur le MVP

Honnêteté sur l'état réel :

- **Le responsive n'a pas été validé sur un appareil physique.** Il l'a été en
  viewport 390 px réel, ce qui a révélé et corrigé quatre défauts — mais un
  simulateur ne remplace pas un pouce sur un écran.
- **La protection contre les mots de passe compromis est désactivée**, ainsi
  que la confirmation d'email. Deux réglages de tableau de bord, assumés pour
  la démonstration, à réactiver avant tout usage réel.
- **Les photos de salle sont servies par l'application.** Changer une photo
  impose un redéploiement. Le passage à Supabase Storage rendrait la gestion
  autonome pour le gérant — c'est une piste d'upsell, pas une dette.
