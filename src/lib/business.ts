/**
 * Constantes métier.
 *
 * ⚠️ Elles DOIVENT rester alignées sur la fonction assert_bookable_slot
 * (migration 03) et sur la table subscription_plans. La base fait foi :
 * ces valeurs ne servent qu'à éviter des allers-retours réseau et à
 * griser l'interface. Toute règle est revérifiée côté serveur.
 *
 * Pour ouvrir le week-end le jour d'une démo : passer WORK_DAYS à
 * [0,1,2,3,4,5,6] ici ET adapter assert_bookable_slot côté base.
 */

/** Première heure réservable (heure de Paris). */
export const OPENING_HOUR = 8

/** Heure de fermeture : le dernier créneau démarre à CLOSING_HOUR - 1. */
export const CLOSING_HOUR = 20

/** Index des jours affichés dans la grille. 0 = lundi. */
export const WORK_DAYS = [0, 1, 2, 3, 4]

/** Durée maximale d'une réservation, en heures consécutives. */
export const MAX_BOOKING_HOURS = 8

/** Horizon de réservation, en jours. */
export const HORIZON_DAYS = 30

/** Toutes les heures de départ possibles : 8, 9, … 19. */
export const HOURS: number[] = Array.from(
  { length: CLOSING_HOUR - OPENING_HOUR },
  (_, i) => OPENING_HOUR + i,
)

export const SUBSCRIPTION_LABEL: Record<string, string> = {
  NOMAD: 'Nomad',
  FULL_TIME: 'Full Time',
}

export const TRANSACTION_LABEL: Record<string, string> = {
  MONTHLY_SUBSCRIPTION: 'Dotation mensuelle',
  TOP_UP: 'Achat de crédits',
  BOOKING_PAYMENT: 'Réservation',
  BOOKING_REFUND: 'Remboursement',
  ADMIN_ADJUSTMENT: 'Ajustement',
}

export const CLOSURE_REASONS = [
  'Travaux',
  'Fuite',
  'Privatisation',
  'Maintenance',
] as const
