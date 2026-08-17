export type Role = 'client' | 'admin'
export type SubscriptionType = 'NOMAD' | 'FULL_TIME'
export type BookingStatus = 'confirmed' | 'cancelled'
export type OrderKind = 'CREDIT_PACK' | 'SUBSCRIPTION'
export type OrderStatus = 'pending' | 'paid' | 'cancelled' | 'failed'

export type TransactionType =
  | 'MONTHLY_SUBSCRIPTION'
  | 'TOP_UP'
  | 'BOOKING_PAYMENT'
  | 'BOOKING_REFUND'
  | 'ADMIN_ADJUSTMENT'

export interface Profile {
  id: string
  name: string
  email: string
  role: Role
  subscription_type: SubscriptionType
  credits: number
  created_at: string
}

export interface Room {
  id: string
  name: string
  capacity: number
  type_label: string
  cost_per_hour: number
  is_available: boolean
  /** Chemin relatif servi par l'app, ou URL absolue. NULL = pas de photo. */
  image_url: string | null
  archived_at: string | null
  created_at: string
}

export interface RoomOption {
  id: string
  name: string
  description: string | null
  credit_cost: number
}

export interface Booking {
  id: string
  user_id: string
  room_id: string
  start_time: string
  end_time: string
  hours_count: number
  room_cost: number
  options_cost: number
  total_cost: number
  status: BookingStatus
  cancelled_at: string | null
  cancellation_reason: string | null
  created_at: string
}

/** Réservation enrichie pour l'affichage en liste. */
export interface BookingDetail extends Booking {
  rooms: Pick<Room, 'id' | 'name' | 'capacity' | 'type_label'> | null
  profiles?: Pick<Profile, 'id' | 'name' | 'email'> | null
  booking_options: { option_id: string; unit_cost: number; options: { name: string } | null }[]
}

/**
 * Ligne renvoyée par get_room_schedule().
 * `label` vaut « Occupé » pour un client tiers, le nom du membre pour
 * un gérant, « Ma réservation » pour soi, et le motif pour une fermeture.
 */
export interface ScheduleEntry {
  kind: 'booking' | 'closure'
  start_time: string
  end_time: string
  booking_id: string | null
  is_mine: boolean
  label: string
  total_cost: number | null
}

export interface CreditPack {
  id: string
  name: string
  credits: number
  price_cents: number
  is_active: boolean
  sort_order: number
}

export interface SubscriptionPlan {
  code: SubscriptionType
  name: string
  monthly_credits: number
  price_cents: number
  description: string | null
}

export interface CreditTransaction {
  id: string
  user_id: string
  amount: number
  type: TransactionType
  description: string | null
  booking_id: string | null
  order_id: string | null
  created_at: string
}

export interface Order {
  id: string
  user_id: string
  kind: OrderKind
  pack_id: string | null
  label: string
  credits_granted: number
  amount_cents: number
  status: OrderStatus
  provider: string
  provider_ref: string | null
  created_at: string
  paid_at: string | null
}

export interface RoomClosure {
  id: string
  room_id: string
  start_time: string
  end_time: string
  reason: string
  created_at: string
}
