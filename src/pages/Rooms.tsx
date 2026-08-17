import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useRooms } from '@/hooks/useCatalog'
import { useAuth } from '@/hooks/useAuth'
import { Badge, Card, Loading, PageTitle, cx } from '@/components/ui'
import { RoomPhoto } from '@/components/RoomPhoto'
import { formatCredits, pluralize } from '@/lib/format'

/** Nom des options proposées par salle, pour la vignette. */
function useOptionsByRoom() {
  const [map, setMap] = useState<Record<string, string[]>>({})

  useEffect(() => {
    void supabase
      .from('room_options')
      .select('room_id, options ( name )')
      .then(({ data }) => {
        const next: Record<string, string[]> = {}
        for (const row of (data ?? []) as unknown as { room_id: string; options: { name: string } | null }[]) {
          if (!row.options) continue
          ;(next[row.room_id] ??= []).push(row.options.name)
        }
        setMap(next)
      })
  }, [])

  return map
}

function RoomIcon({ capacity }: { capacity: number }) {
  return (
    <span className="flex items-center gap-1.5 text-sm text-ink-soft">
      <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
        <circle cx="7" cy="7" r="3" />
        <path d="M2 16.5c0-2.5 2.2-4.5 5-4.5s5 2 5 4.5" strokeLinecap="round" />
        <path d="M13.5 5.2a3 3 0 0 1 0 5.6M15 16.5c0-2-.9-3.7-2.3-4.7" strokeLinecap="round" />
      </svg>
      {pluralize(capacity, 'personne', 'personnes')}
    </span>
  )
}

export function Rooms() {
  const rooms = useRooms()
  const optionsByRoom = useOptionsByRoom()
  const { profile } = useAuth()

  if (!rooms) return <Loading label="Chargement des salles…" />

  return (
    <>
      <PageTitle
        title="Nos salles"
        subtitle="Choisissez une salle pour consulter ses disponibilités et réserver."
      />

      {(profile?.credits ?? 0) === 0 && (
        <Card className="mb-6 border-amber/25 bg-amber-soft p-4">
          <p className="text-sm">
            <span className="font-medium">Votre solde est à zéro.</span>{' '}
            Vous pouvez consulter les disponibilités, mais la réservation nécessite des crédits.{' '}
            <Link to="/credits" className="font-medium text-accent hover:underline">
              Acheter des crédits →
            </Link>
          </p>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {rooms.map((room) => {
          const options = optionsByRoom[room.id] ?? []
          const closed = !room.is_available

          return (
            <Card
              key={room.id}
              className={cx('flex flex-col overflow-hidden transition-shadow', !closed && 'hover:shadow-sm')}
            >
              <div className="relative">
                <RoomPhoto src={room.image_url} alt={`La salle ${room.name}`} />
                {closed && (
                  <div className="absolute inset-0 grid place-items-center bg-ink/45">
                    <Badge tone="rust">Hors service</Badge>
                  </div>
                )}
              </div>

              <div className="flex flex-1 flex-col p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold tracking-tight">{room.name}</h2>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1">
                    <RoomIcon capacity={room.capacity} />
                    <Badge>{room.type_label}</Badge>
                  </div>
                </div>
                <div className="shrink-0 rounded-xl bg-accent-soft px-3 py-2 text-center">
                  <p className="text-xl leading-none font-semibold text-accent">{room.cost_per_hour}</p>
                  <p className="mt-1 text-[11px] text-accent/70">
                    {room.cost_per_hour > 1 ? 'crédits/h' : 'crédit/h'}
                  </p>
                </div>
              </div>

              <div className="mt-4 min-h-[2.5rem]">
                {options.length > 0 ? (
                  <>
                    <p className="mb-1.5 text-xs tracking-wide text-ink-faint uppercase">
                      Options disponibles
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {options.map((name) => (
                        <Badge key={name} tone="accent">{name}</Badge>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-ink-faint">Aucune option proposée dans cette salle.</p>
                )}
              </div>

              <div className="mt-auto flex items-center justify-between gap-3 border-t border-line pt-4">
                <span className="text-sm text-ink-faint">
                  À partir de {formatCredits(room.cost_per_hour)}
                </span>
                <Link
                  to={`/salles/${room.id}`}
                  className="text-sm font-medium whitespace-nowrap text-accent hover:underline"
                >
                  Voir les disponibilités →
                </Link>
              </div>
              </div>
            </Card>
          )
        })}
      </div>
    </>
  )
}
