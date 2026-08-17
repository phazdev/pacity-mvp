# Kickoff — Pacity, réservation de salles

Document de lancement, nourri de ce qui a réellement été construit.
Démonstration en ligne : **https://pacity-mvp.vercel.app**

---

## 1 · Le problème, tel que vous le vivez

> « Aujourd'hui, les réservations se font via Google Calendar + messages Slack,
> ce qui génère des erreurs, des conflits d'horaires, et des oublis de
> facturation. Tous les membres n'ont pas forcément Slack. »

Trois symptômes, une cause commune : **aucun système ne fait autorité**. Le
calendrier ne connaît pas vos tarifs, Slack ne garde pas de trace opposable, et
la facturation vit ailleurs. Chaque outil détient un morceau de la vérité.

| Symptôme | Ce qui se passe réellement |
| :--- | :--- |
| Conflits d'horaires | Deux personnes posent le même créneau ; rien ne les en empêche |
| Oublis de facturation | La consommation n'est reliée à aucun compteur |
| Membres exclus | Slack est le canal de coordination, mais tout le monde n'y est pas |

**L'objectif n'est donc pas « un calendrier de plus »**, mais un point de
vérité unique qui rende ces trois situations structurellement impossibles.

---

## 2 · Ce que nous avons compris de votre besoin

Le brief décrit un système de crédits, quatre salles et deux abonnements. En le
confrontant au réel, quatre questions n'y étaient pas tranchées. Nous les avons
arbitrées avec vous.

**Un membre Nomad ne peut rien réserver — mais pourquoi ?**
Parce qu'il n'a pas de crédits, pas parce qu'une règle le lui interdit. La
nuance est décisive : elle rend la vente de packs cohérente. Un Nomad qui
achète des crédits peut réserver. Une seule règle gouverne l'accès — *le solde
suffit-il ?* — au lieu de deux règles qui se contredisent.

**Qui annule ?**
Vous seul, avec remboursement intégral. C'est ce que demande le brief. Cela
crée une friction, que nous assumons et documentons plutôt que de la masquer :
elle constitue la première piste d'évolution.

**Une salle indisponible, ça veut dire quoi ?**
Le brief cite « travaux, fuite, privatisation » — trois situations **datées**,
pas un interrupteur définitif. Nous avons donc construit des fermetures avec
début, fin et motif. Les réservations touchées sont annulées et remboursées
automatiquement.

**Que voit un membre de l'agenda des autres ?**
Qu'un créneau est pris, jamais par qui. Vous, vous voyez les noms. Cette
distinction n'était pas dans le brief, mais elle relève de la confidentialité
la plus élémentaire dans un espace partagé.

---

## 3 · Le périmètre livré

### Pour vos membres

Inscription et connexion · consultation des salles et de leurs caractéristiques
· **grille de disponibilités par salle**, où l'occupation s'affiche et où le
vide est réservable · choix de la durée et des options réellement proposées
dans cette salle · suivi du solde et historique complet des mouvements · achat
de crédits et souscription d'abonnement.

### Pour vous

Toutes les réservations de tous les membres, avec leurs noms · annulation
motivée avec remboursement automatique · fermeture datée d'une salle ·
ajustement manuel du solde d'un membre · déclenchement de la dotation
mensuelle.

### Hors périmètre, volontairement

Paiement réel, notifications, réservations récurrentes, résiliation
d'abonnement, application mobile native. Chacun est chiffré dans
[`UPSELL.md`](UPSELL.md) — ce ne sont pas des oublis, ce sont des choix.

---

## 4 · Ce qui garantit que ça marche

C'est ici que se joue la différence avec un tableau partagé. Quatre garanties
sont inscrites **dans la base de données**, pas dans l'application — donc
impossibles à contourner, y compris par une erreur de développement future.

**Le double-booking est impossible.** Pas « vérifié », impossible. Le moteur de
base de données refuse deux réservations qui se chevauchent sur une même salle,
de manière atomique. L'approche naïve — vérifier puis enregistrer — laisse une
fenêtre de quelques millisecondes pendant laquelle deux membres passent. Cette
fenêtre ne se voit jamais en démonstration ; elle se manifeste le jour où deux
personnes cliquent en même temps sur la dernière salle libre.

**Un solde ne peut pas être faux.** Chaque mouvement de crédit est inscrit dans
un registre que rien ne peut modifier ni supprimer. Le solde affiché en découle
mécaniquement. Une correction s'enregistre comme un mouvement inverse — jamais
en réécrivant l'historique.

**Une réservation est tout ou rien.** Réserver enchaîne six opérations. Si l'une
échoue, aucune n'est conservée. Pas de membre débité sans réservation, pas de
réservation sans ses options.

**Un paiement ne crédite jamais deux fois.** Y compris si le prestataire de
paiement renvoie deux fois la même confirmation — le piège classique des
webhooks.

> Ces quatre points ont été vérifiés par **18 tests** avant qu'une seule ligne
> d'interface ne soit écrite.

---

## 5 · La stack, en une phrase

**Supabase** (PostgreSQL, authentification, temps réel) et **React**, déployés
sur **Vercel**. Coût d'infrastructure : **0 €**, tout tient dans les paliers
gratuits.

Le choix s'est joué sur un critère unique : les outils no-code classiques
(Airtable, Bubble, Firebase) ne savent pas garantir qu'une salle n'est réservée
qu'une fois. Sur un produit dont la raison d'être est de supprimer les conflits
d'horaires, c'était rédhibitoire. Le raisonnement complet, alternatives
comprises, est dans [`STACK.md`](STACK.md).

---

## 6 · Le déroulé

| Étape | Contenu | État |
| :--- | :--- | :--- |
| Cadrage | Onze décisions arbitrées avec vous | ✅ |
| Fondations | 14 migrations, 18 vérifications | ✅ |
| Application | Parcours membre et gérant | ✅ |
| Mise en ligne | Déploiement continu | ✅ |
| Livrables | Roadmap, stack, upsell | ✅ |

Chaque `git push` publie automatiquement en production. Le code est public :
**https://github.com/phazdev/pacity-mvp**

---

## 7 · Les risques, et comment ils sont traités

| Risque | Traitement |
| :--- | :--- |
| Deux réservations simultanées | Contrainte au niveau du moteur — impossible par construction |
| Solde qui dérive | Registre immuable, solde dérivé, réconciliation vérifiable |
| Un membre voit l'agenda des autres | Règles d'accès dans la base, occupation anonymisée |
| Double crédit sur un paiement | Point d'entrée unique, rejouable sans effet |
| Perte du prestataire d'hébergement | Schéma et logique en SQL standard, versionnés dans le dépôt |
| Reprise par un autre développeur | Le *pourquoi* de chaque choix est documenté, pas seulement le *quoi* |

**Deux points restent ouverts**, et il est plus honnête de les nommer :
l'affichage mobile a été validé en navigateur mais pas sur un téléphone
physique ; et deux réglages de sécurité (confirmation d'email, détection des
mots de passe compromis) sont désactivés pour fluidifier la démonstration —
à réactiver avant tout usage réel.

---

## 8 · La suite

Trois chantiers se justifient sans attendre de données d'usage :

1. **L'annulation en autonomie** — supprime la seule friction structurelle du produit
2. **Le paiement réel** — l'architecture est déjà prête, il ne manque que la couche d'encaissement
3. **Les rapports d'occupation** — sans eux, toute décision de tarification est une intuition

Le détail, avec effort et bénéfice chiffré, est dans [`UPSELL.md`](UPSELL.md).

---

## Essayer maintenant

**https://pacity-mvp.vercel.app** · mot de passe commun : `Pacity2026!`

| Compte | Rôle | À observer |
| :--- | :--- | :--- |
| `sophie@pacity.fr` | Nomad, 0 crédit | Ne peut rien réserver, puis achète et réserve |
| `pierre@pacity.fr` | Full Time, 4 crédits | Voit « Occupé » sans savoir qui occupe |
| `mathieu@pacity.fr` | Gérant | Voit tous les noms, annule, ferme une salle |

Le parcours le plus parlant : connectez-vous en **Sophie**, constatez qu'aucune
réservation n'est possible, achetez un pack, réservez — puis repassez en
**Mathieu** pour annuler et voir le solde de Sophie remonter.
