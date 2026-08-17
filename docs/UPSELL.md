# Pistes d'upsell

Document Upsell — ce que Pacity peut acheter ensuite, ce que ça coûte à
construire, et ce que ça rapporte.

---

## Comment lire les chiffres

Les montants s'appuient sur **la grille tarifaire réelle du projet** :
abonnement Full Time à 39 €/mois pour 20 crédits, packs à 15 € / 25 € / 45 €.

Les volumes, eux, sont des **hypothèses explicitement posées** — Pacity n'a pas
encore de données d'usage, puisque les réservations se faisaient jusqu'ici dans
Google Calendar. Chaque estimation indique son hypothèse, pour que Mathieu
puisse la remplacer par ses propres chiffres. Ce sont des ordres de grandeur
destinés à prioriser, pas des prévisions.

Les efforts sont en jours de développement.

---

## 1. Annulation self-service · ~1 jour

**Le problème.** Aujourd'hui, seul le gérant peut annuler. Un membre qui s'est
trompé de créneau doit écrire à Mathieu, attendre, et pendant ce temps la salle
reste bloquée pour tout le monde. C'est la friction la plus visible du MVP, et
elle est assumée — le brief le demandait ainsi.

**Ce qu'on construit.** Le membre annule lui-même jusqu'à une heure avant le
début et récupère ses crédits. Au-delà, les crédits sont perdus : c'est ce qui
dissuade de bloquer une salle « au cas où ».

**Le bénéfice.** *Hypothèse : 15 annulations par mois, 5 minutes de gérant
chacune.* Environ **1 h 15 de gérant récupérée chaque mois**, et surtout des
créneaux libérés plus tôt, donc réutilisables. La règle de préavis crée en
prime une incitation à ne réserver que ce dont on a besoin.

> C'est le chantier au meilleur rapport effort / effet perçu. Il transforme la
> seule frustration structurelle du produit en argument commercial.

---

## 2. Paiement réel · ~2 jours

**Le problème.** Le tunnel d'achat existe et fonctionne, mais aucun euro ne
circule : c'est le gérant qui crédite à la main. Un membre à court de crédits
un dimanche soir attend le lundi.

**Ce qu'on construit.** Stripe Checkout à la place du bouton simulé, plus une
fonction webhook qui confirme le paiement. **L'architecture est déjà prête** :
tout encaissement passe par une fonction unique, `fulfill_order`, conçue pour
être rejouable sans jamais créditer deux fois — le piège classique des webhooks
de paiement. Le schéma, le grand livre et les soldes ne bougent pas.

**Le bénéfice.** *Hypothèse : 10 packs Régulier vendus par mois.* Environ
**250 €/mois encaissés sans aucune intervention**, disponibles 24 h sur 24. Le
gain réel n'est pas tant le montant que la suppression du délai : un membre qui
veut réserver maintenant paie maintenant.

---

## 3. Notifications de rappel · ~2 jours

**Le problème.** Une salle réservée puis désertée est perdue pour tout le
monde : elle apparaît occupée, personne d'autre ne peut la prendre.

**Ce qu'on construit.** Un rappel la veille et une heure avant, par email, avec
un lien d'annulation direct. Techniquement, l'ordonnanceur `pg_cron` est déjà
en service pour la dotation mensuelle — il n'y a qu'à ajouter une tâche.

**Le bénéfice.** *Hypothèse : 200 réservations par mois, 10 % non honorées,
réduites de moitié.* Environ **10 créneaux récupérés chaque mois**, soit une
trentaine de crédits qui redeviennent vendables — de l'ordre de 75 € de valeur,
sans compter les membres qui trouvent enfin une salle libre.

---

## 4. Rapports d'occupation · ~3 jours

**Le problème.** Mathieu ne sait pas quelles salles se remplissent, à quelles
heures, ni lesquelles dorment. Toute décision — ouvrir une salle, ajuster un
tarif, modifier les horaires — se prend à l'intuition.

**Ce qu'on construit.** Un tableau de bord : taux d'occupation par salle, par
créneau horaire et par jour ; membres les plus actifs ; crédits consommés
contre crédits distribués. Toutes les données existent déjà — le grand livre
enregistre tout depuis le premier jour.

**Le bénéfice.** Indirect, mais **c'est le chantier qui rend les autres
pertinents**. Un exemple concret : si la Large Room tourne à 20 % d'occupation,
la vraie question n'est pas d'en ouvrir une seconde, c'est de baisser son tarif
en heures creuses ou de la scinder. Sans mesure, on répond au hasard.

> À recommander avant toute décision de tarification. C'est la piste dont la
> valeur dépasse le plus largement son coût.

---

## 5. Réservations récurrentes · ~3 jours

**Le problème.** Une équipe qui tient son point hebdomadaire le mardi à 14 h
doit le réserver manuellement, semaine après semaine — et se fait doubler dès
qu'elle oublie.

**Ce qu'on construit.** « Répéter chaque mardi jusqu'au 30 juin », avec
détection des conflits à la création et débit à chaque occurrence.

**Le bénéfice.** *Hypothèse : 5 équipes posent un rituel hebdomadaire en Medium
Room.* Environ **60 crédits de consommation supplémentaire par mois**, et
surtout un effet de rétention : une équipe dont le rituel vit dans l'outil ne
retourne pas dans Google Calendar.

---

## 6. Comptes entreprise · ~5 jours

**Le problème.** Le brief décrit Pacity comme un coworking « pour entreprises
et freelances ». Or le produit ne connaît aujourd'hui que des individus. Une
entreprise de huit personnes doit créer huit comptes, payer huit fois, et
n'a aucune visibilité sur ce que consomment ses équipes.

**Ce qu'on construit.** Une entité entreprise regroupant plusieurs membres :
facturation unique, budget de crédits partagé ou par personne, et un
gestionnaire délégué qui voit la consommation de son équipe.

**Le bénéfice.** *Hypothèse : une entreprise de 8 personnes en Full Time.*
**Environ 312 €/mois sur un seul contrat**, contre huit relations
individuelles à gérer. C'est le levier de revenu le plus important de la liste,
et le plus structurant commercialement — mais il ne se justifie qu'une fois
la demande B2B confirmée.

---

## 7. Check-in par QR code · ~4 jours

Un QR code à l'entrée de chaque salle. Sans check-in dans les quinze premières
minutes, le créneau est automatiquement libéré et les crédits rendus.

Résout le no-show à la racine plutôt que par le rappel. Suppose que les membres
acceptent le geste — à tester auprès d'eux avant de construire.

---

## 8. Photos gérées par le gérant · ~0,5 jour

Aujourd'hui les photos de salle sont livrées avec l'application : les changer
impose un redéploiement. Les basculer vers Supabase Storage rendrait Mathieu
autonome, avec un simple téléversement depuis son espace de gestion.

Le champ `image_url` a été conçu pour ça — il accepte déjà une URL absolue,
donc **aucune migration ne sera nécessaire**. Petit chantier, effet immédiat
sur l'autonomie du gérant.

---

## Ordre recommandé

```
1. Annulation self-service   ← supprime la friction du MVP
2. Paiement réel             ← ouvre le revenu en autonomie
3. Rapports d'occupation     ← éclaire toutes les décisions suivantes
────────────────────────────── point de décision
4. Notifications  ·  5. Récurrences  ·  6. Comptes entreprise
```

Les trois premières se justifient sans données. **Après elles, il faut
regarder les chiffres d'usage avant de choisir** : selon que Pacity attire
surtout des freelances ou des équipes, la priorité bascule entre les
récurrences et les comptes entreprise.
