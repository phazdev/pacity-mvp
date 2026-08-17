import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { ScheduleEntry } from '@/lib/types'
import { addWeeks } from '@/lib/time'

/**
 * Occupation d'une salle sur la semaine affichée.
 *
 * ⚠️ On interroge la RPC get_room_schedule, JAMAIS la table `bookings`.
 * La RLS empêcherait un membre de voir les réservations des autres : sa
 * grille paraîtrait vide alors que les créneaux sont pris. La RPC renvoie
 * l'occupation anonymisée (« Occupé » pour un client, le nom réel pour le
 * gérant). Voir docs/REALTIME.md.
 */
export function useRoomSchedule(roomId: string | undefined, weekStart: Date) {
  const [entries, setEntries] = useState<ScheduleEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const from = weekStart.toISOString()
  const to = addWeeks(weekStart, 1).toISOString()

  const load = useCallback(async () => {
    if (!roomId) return
    const { data, error } = await supabase.rpc('get_room_schedule', {
      p_room_id: roomId,
      p_from: from,
      p_to: to,
    })
    if (error) {
      setError(error.message)
      return
    }
    setError(null)
    setEntries((data ?? []) as ScheduleEntry[])
  }, [roomId, from, to])

  useEffect(() => {
    setEntries(null)
    void load()
  }, [load])

  /**
   * Rafraîchissement automatique. On écoute la table témoin
   * room_schedule_events, filtrée sur CETTE salle : une réservation dans
   * une autre salle ne doit pas provoquer de rechargement.
   * Le payload ne sert qu'à déclencher — toute la donnée vient de la RPC.
   */
  useEffect(() => {
    if (!roomId) return

    const channel = supabase
      .channel(`room-schedule-${roomId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'room_schedule_events',
          filter: `room_id=eq.${roomId}`,
        },
        () => {
          void load()
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [roomId, load])

  return { entries, error, reload: load }
}
