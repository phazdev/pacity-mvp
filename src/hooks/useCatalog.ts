import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { CreditPack, Room, RoomOption, SubscriptionPlan } from '@/lib/types'

/** Salles actives, triées par coût croissant (la plus accessible d'abord). */
export function useRooms() {
  const [rooms, setRooms] = useState<Room[] | null>(null)

  useEffect(() => {
    void supabase
      .from('rooms')
      .select('*')
      .is('archived_at', null)
      .order('cost_per_hour')
      .then(({ data }) => setRooms((data ?? []) as Room[]))
  }, [])

  return rooms
}

export function useRoom(roomId: string | undefined) {
  const [room, setRoom] = useState<Room | null | undefined>(undefined)

  useEffect(() => {
    if (!roomId) return
    void supabase
      .from('rooms')
      .select('*')
      .eq('id', roomId)
      .maybeSingle()
      .then(({ data }) => setRoom(data as Room | null))
  }, [roomId])

  return room
}

/** Options réellement proposées dans cette salle — pas le catalogue entier. */
export function useRoomOptions(roomId: string | undefined) {
  const [options, setOptions] = useState<RoomOption[] | null>(null)

  useEffect(() => {
    if (!roomId) return
    void supabase
      .from('room_options')
      .select('options ( id, name, description, credit_cost )')
      .eq('room_id', roomId)
      .then(({ data }) => {
        const list = (data ?? [])
          .map((r) => (r as unknown as { options: RoomOption | null }).options)
          .filter((o): o is RoomOption => o !== null)
          .sort((a, b) => a.credit_cost - b.credit_cost || a.name.localeCompare(b.name))
        setOptions(list)
      })
  }, [roomId])

  return options
}

export function useCreditPacks() {
  const [packs, setPacks] = useState<CreditPack[] | null>(null)

  useEffect(() => {
    void supabase
      .from('credit_packs')
      .select('*')
      .eq('is_active', true)
      .order('sort_order')
      .then(({ data }) => setPacks((data ?? []) as CreditPack[]))
  }, [])

  return packs
}

export function useSubscriptionPlan(code: 'NOMAD' | 'FULL_TIME') {
  const [plan, setPlan] = useState<SubscriptionPlan | null>(null)

  useEffect(() => {
    void supabase
      .from('subscription_plans')
      .select('*')
      .eq('code', code)
      .maybeSingle()
      .then(({ data }) => setPlan(data as SubscriptionPlan | null))
  }, [code])

  return plan
}
