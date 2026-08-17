# 🚀 Complément d'Architecture & Directives MVP (V2) — Pacity

> **Note à l'attention de Claude Code :**
> Ce document définit la stack technique, le schéma de BDD cible avec coût fixe des options, et la logique métier exacte à implémenter sur Supabase et React via MCP.

---

## 🛠️ 1. Choix de la Stack Technique

* **Backend / Database :** Supabase (PostgreSQL, Auth, RLS).
* **Frontend :** React + Vite + Tailwind CSS.
* **Diction & Vibe Coding :** Développement piloté via Claude Code / MCP Supabase.
* **Projet Supabase :** Le projet Supabase est déjà créé et vierge. **Claude Code est en charge de générer et exécuter le DDL (Data Definition Language) directement via MCP.**

---

## 🗄️ 2. Modèle de Données Cible (Supabase Schema)

### A. Table `users`
* `id` : `UUID` (Primary Key, default: `gen_random_uuid()`)
* `name` : `TEXT` (not null)
* `email` : `TEXT` (not null, unique)
* `role` : `TEXT` (default: `'client'`, valeurs : `'client'`, `'admin'`)
* `subscription_type` : `TEXT` (valeurs : `'NOMAD'`, `'FULL_TIME'`)
* `credits` : `INTEGER` (default: `0`)
* `created_at` : `TIMESTAMPTZ` (default: `now()`)

### B. Table `rooms`
* `id` : `UUID` (Primary Key, default: `gen_random_uuid()`)
* `name` : `TEXT` (not null) — *ex: Phone Booth, Small Room, Medium Room, Large Room*
* `capacity` : `INTEGER` (not null) — *1, 4, 8, 16 pers*
* `type_label` : `TEXT` — *Appels, Réunion, Conférence*
* `cost_per_hour` : `INTEGER` (not null) — *1, 2, 3, 5 crédits/h*
* `is_available` : `BOOLEAN` (default: `true`) — *Mise en indisponibilité administrative (travaux, fuite, privatisation)*
* `created_at` : `TIMESTAMPTZ` (default: `now()`)

### C. Table `options` (Catalogue des options — Coût fixe unique)
* `id` : `UUID` (Primary Key, default: `gen_random_uuid()`)
* `name` : `TEXT` (not null) — *ex: Vidéoprojecteur, Panier de fruits, Paperboard digital*
* `description` : `TEXT`
* `credit_cost` : `INTEGER` (not null) — *Coût fixe unique en crédits par réservation*
* `created_at` : `TIMESTAMPTZ` (default: `now()`)

### D. Table `room_options` (Disponibilité des options par salle)
* `room_id` : `UUID` (FK -> `rooms.id` ON DELETE CASCADE)
* `option_id` : `UUID` (FK -> `options.id` ON DELETE CASCADE)
* Primary Key : (`room_id`, `option_id`)

### E. Table `bookings` (Réservations sans chevauchement)
* `id` : `UUID` (Primary Key, default: `gen_random_uuid()`)
* `user_id` : `UUID` (FK -> `users.id` ON DELETE CASCADE)
* `room_id` : `UUID` (FK -> `rooms.id` ON DELETE CASCADE)
* `start_time` : `TIMESTAMPTZ` (not null)
* `end_time` : `TIMESTAMPTZ` (not null)
* `hours_count` : `INTEGER` (not null) — *Durée en heures*
* `room_cost` : `INTEGER` (not null) — *Coût lié à la salle (durée × tarif heure)*
* `options_cost` : `INTEGER` (default: `0`) — *Somme fixe des options sélectionnées*
* `total_cost` : `INTEGER` (not null) — *room_cost + options_cost*
* `status` : `TEXT` (default: `'confirmed'`, valeurs : `'confirmed'`, `'cancelled'`)
* `created_at` : `TIMESTAMPTZ` (default: `now()`)

> ⚠️ **Règle Anti-Chevauchement (Double-Booking) :**
> Bloquer l'insertion si une réservation active (`status = 'confirmed'`) existe sur la même salle avec :
> `(start_time < new_end_time) AND (end_time > new_start_time)`

### F. Table `booking_options` (Options choisies par réservation)
* `booking_id` : `UUID` (FK -> `bookings.id` ON DELETE CASCADE)
* `option_id` : `UUID` (FK -> `options.id` ON DELETE CASCADE)
* `unit_cost` : `INTEGER` (not null)
* Primary Key : (`booking_id`, `option_id`)

### G. Table `credit_transactions` (Traçabilité comptable immuable)
* `id` : `UUID` (Primary Key, default: `gen_random_uuid()`)
* `user_id` : `UUID` (FK -> `users.id` ON DELETE CASCADE)
* `amount` : `INTEGER` (not null) — *Positif (crédit) ou Négatif (débit)*
* `type` : `TEXT` (not null) — *valeurs : `'MONTHLY_SUBSCRIPTION'`, `'TOP_UP'`, `'BOOKING_PAYMENT'`, `'BOOKING_REFUND'`*
* `description` : `TEXT`
* `created_at` : `TIMESTAMPTZ` (default: `now()`)

---

## 🧮 3. Formule de Calcul du Coût Total

$$\text{Coût Total} = (\text{Heures} \times \text{Tarif Salle}) + \sum \text{Coût Fixe Options}$$

---

## 🎯 4. Jeu de Données Initiales (Seed Data)

1. **Users :**
   * Pierre Hazebaert (`client`, `FULL_TIME`, 20 crédits)
   * Mathieu (`admin`, Gérant Pacity)
2. **Rooms :**
   * *Phone Booth* (1 pers, 1 cr/h)
   * *Small Room* (4 pers, 2 cr/h)
   * *Medium Room* (8 pers, 3 cr/h)
   * *Large Room* (16 pers, 5 cr/h)
3. **Options (Coûts fixes uniques) :**
   * *Vidéoprojecteur* (2 crédits)
   * *Panier de fruits* (2 crédits)
   * *Paperboard digital* (1 crédit)
4. **Associations (`room_options`) :**
   * *Phone Booth* : Aucune option
   * *Small Room* : Panier de fruits, Paperboard digital
   * *Medium & Large Rooms* : Toutes les options
5. **Transactions :**
   * Ligne initiale de +20 crédits pour Pierre (`MONTHLY_SUBSCRIPTION`)

---

## 🚀 5. Consignes de Déploiement pour Claude Code

1. Exécuter le DDL et le Seed Data sur Supabase via MCP.
2. Créer le projet React Vite + Tailwind.
3. Développer le calendrier interactif par salle, le sélecteur d'options fixes par salle, la modale d'historique de crédits, et la vue Admin/Gérant.