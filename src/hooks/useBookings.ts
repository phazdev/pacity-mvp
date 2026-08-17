import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { BookingDetail } from '@/lib/types'

// `bookings` référence `profiles` DEUX fois (user_id et cancelled_by).
// Sans nommer explicitement la contrainte, PostgREST refuse la jointure :
// « more than one relationship was found ».
const SELECT = `
  *,
  rooms ( id, name, capacity, type_label ),
  profiles!bookings_user_id_fkey ( id, name, email ),
  booking_options ( option_id, unit_cost, options ( name ) )
`

/**
 * Réservations visibles par l'utilisateur courant.
 *
 * Aucun filtre n'est appliqué ici : la RLS s'en charge. Un membre reçoit
 * les siennes, le gérant reçoit toutes celles du coworking. C'est ce qui
 * permet au tableau de bord d'être le même écran pour les deux rôles.
 */
export function useBookings() {
  const [bookings, setBookings] = useState<BookingDetail[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('bookings')
      .select(SELECT)
      .order('start_time', { ascending: false })

    if (error) {
      setError(error.message)
      return
    }
    setError(null)
    setBookings((data ?? []) as unknown as BookingDetail[])
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // `bookings` est publiée en Realtime : la RLS filtre déjà les événements
  // reçus, donc un membre n'est réveillé que par SES réservations — dont
  // le passage à « annulée » quand le gérant intervient.
  useEffect(() => {
    const channel = supabase
      .channel('bookings-feed')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, () => {
        void load()
      })
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [load])

  return { bookings, error, reload: load }
}
