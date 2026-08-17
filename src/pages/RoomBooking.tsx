import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useRoom, useRoomOptions } from '@/hooks/useCatalog'
import { useRoomSchedule } from '@/hooks/useRoomSchedule'
import { supabase, errorMessage } from '@/lib/supabase'
import { CLOSING_HOUR, HORIZON_DAYS, MAX_BOOKING_HOURS, WORK_DAYS } from '@/lib/business'
import {
  addWeeks, formatDayLong, formatDayNum, formatTime, slotInstant, startOfParisWeek,
} from '@/lib/time'
import { formatCredits } from '@/lib/format'
import { GridLegend, WeekGrid, type Selection } from '@/components/WeekGrid'
import { RoomPhoto } from '@/components/RoomPhoto'
import {
  Alert, Badge, Button, Card, Loading, Spinner, cx,
} from '@/components/ui'

export function RoomBooking() {
  const { roomId } = useParams<{ roomId: string }>()
  const { profile, refreshProfile } = useAuth()
  const room = useRoom(roomId)
  const options = useRoomOptions(roomId)

  const panelRef = useRef<HTMLDivElement>(null)
  const [weekStart, setWeekStart] = useState(() => startOfParisWeek(new Date()))
  const { entries, reload } = useRoomSchedule(roomId, weekStart)

  const [selection, setSelection] = useState<Selection | null>(null)
  const [chosenOptions, setChosenOptions] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  /** Un créneau est libre s'il n'est couvert par aucune entrée d'agenda. */
  const isFree = useCallback(
    (dayIndex: number, hour: number) => {
      if (!entries) return false
      const t = slotInstant(weekStart, dayIndex, hour).getTime()
      if (t < Date.now()) return false
      if (t > Date.now() + HORIZON_DAYS * 86_400_000) return false
      return !entries.some(
        (e) => new Date(e.start_time).getTime() <= t && new Date(e.end_time).getTime() > t,
      )
    },
    [entries, weekStart],
  )

  /** Heures libres consécutives depuis ce créneau, dans la même journée. */
  const maxHoursFrom = useCallback(
    (dayIndex: number, hour: number) => {
      let n = 0
      while (
        n < MAX_BOOKING_HOURS &&
        hour + n < CLOSING_HOUR &&
        isFree(dayIndex, hour + n)
      ) n++
      return n
    },
    [isFree],
  )

  const handleSelect = (dayIndex: number, hour: number) => {
    setError(null)
    setSuccess(null)
    setSelection({ dayIndex, hour, hours: 1 })
  }

  /**
   * Sur mobile le panneau est SOUS la grille : sans ce défilement, toucher
   * un créneau ne produit aucun effet visible.
   *
   * Le délai est nécessaire : au clic, le navigateur donne le focus au
   * bouton et effectue son propre recentrage, qui annule un défilement
   * fluide déclenché trop tôt. On attend donc que ce soit passé.
   * On ne dépend que du créneau choisi — changer la durée ne doit pas
   * relancer le défilement.
   */
  const selKey = selection ? `${selection.dayIndex}-${selection.hour}` : null
  useEffect(() => {
    if (!selKey) return
    if (!window.matchMedia('(max-width: 1023px)').matches) return
    let fallback: ReturnType<typeof setTimeout>
    const id = setTimeout(() => {
      const el = panelRef.current
      if (!el) return
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })

      // Le défilement fluide est purement et simplement ignoré dans
      // certains contextes (iframe non focalisée, prefers-reduced-motion) :
      // il échoue en silence. Si le panneau n'est toujours pas remonté,
      // on y va d'un coup.
      fallback = setTimeout(() => {
        if (el.getBoundingClientRect().top > window.innerHeight * 0.8) {
          el.scrollIntoView({ block: 'start' })
        }
      }, 500)
    }, 120)

    return () => {
      clearTimeout(id)
      clearTimeout(fallback)
    }
  }, [selKey])

  const maxHours = selection ? maxHoursFrom(selection.dayIndex, selection.hour) : 0

  const start = selection ? slotInstant(weekStart, selection.dayIndex, selection.hour) : null
  const end = selection
    ? slotInstant(weekStart, selection.dayIndex, selection.hour + selection.hours)
    : null

  const optionsCost = useMemo(
    () => (options ?? [])
      .filter((o) => chosenOptions.has(o.id))
      .reduce((sum, o) => sum + o.credit_cost, 0),
    [options, chosenOptions],
  )

  const roomCost = (selection?.hours ?? 0) * (room?.cost_per_hour ?? 0)
  const totalCost = roomCost + optionsCost
  const balance = profile?.credits ?? 0
  const affordable = totalCost <= balance

  const toggleOption = (id: string) => {
    setChosenOptions((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const confirm = async () => {
    if (!selection || !start || !end || !roomId) return
    setBusy(true)
    setError(null)

    const { error } = await supabase.rpc('create_booking', {
      p_room_id: roomId,
      p_start: start.toISOString(),
      p_end: end.toISOString(),
      p_option_ids: [...chosenOptions],
    })

    setBusy(false)

    if (error) {
      // Le message vient de la RPC, rédigé pour l'utilisateur final.
      setError(errorMessage(error))
      // Le créneau a pu être pris entre-temps : on resynchronise.
      void reload()
      return
    }

    setSuccess(`Réservation confirmée — ${formatCredits(totalCost)} débités.`)
    setSelection(null)
    setChosenOptions(new Set())
    await refreshProfile()
    void reload()
  }

  const currentWeek = startOfParisWeek(new Date())
  const canGoBack = weekStart.getTime() > currentWeek.getTime()

  if (room === undefined) return <Loading label="Chargement de la salle…" />
  if (room === null) {
    return (
      <Alert>
        Cette salle est introuvable. <Link to="/salles" className="underline">Retour aux salles</Link>
      </Alert>
    )
  }

  return (
    <>
      {/*
        Vignette plutôt que bannière pleine largeur : les photos sources
        vont de 500×496 à 1200×900. Étirée sur toute la largeur, la plus
        petite était agrandie 2,2× et devenait floue. En vignette, aucune
        n'est agrandie — et sur mobile on atteint la grille sans faire
        défiler une grande image.
      */}
      <div className="mb-7 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <RoomPhoto
            src={room.image_url}
            alt={`La salle ${room.name}`}
            ratio="aspect-square"
            className="size-16 shrink-0 rounded-xl sm:size-20"
          />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{room.name}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-soft">
              <span>{room.capacity} personnes · {room.type_label}</span>
              <Badge tone="accent">{formatCredits(room.cost_per_hour)} / heure</Badge>
            </div>
          </div>
        </div>
        <Link to="/salles" className="text-sm font-medium text-ink-soft hover:text-ink">
          ← Toutes les salles
        </Link>
      </div>

      {!room.is_available && (
        <Alert tone="rust">
          Cette salle est actuellement hors service. Les réservations sont suspendues.
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        {/* ---------------- Grille ----------------
            min-w-0 est indispensable : un enfant de grille CSS a
            min-width:auto, donc le min-w-[640px] de la grille horaire
            forcerait la colonne à 640px et ferait déborder toute la page
            sur mobile — au lieu de laisser défiler la seule grille. */}
        <Card className="min-w-0 p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium">
                Semaine du {formatDayNum(slotInstant(weekStart, 0, 12))}
              </p>
              <p className="text-sm text-ink-soft">
                Touchez un créneau libre pour commencer.
              </p>
            </div>
            <div className="flex shrink-0 gap-1">
              <Button
                variant="secondary"
                disabled={!canGoBack}
                onClick={() => setWeekStart(addWeeks(weekStart, -1))}
                aria-label="Semaine précédente"
                className="px-3"
              >
                ←
              </Button>
              <Button
                variant="secondary"
                onClick={() => setWeekStart(addWeeks(weekStart, 1))}
                aria-label="Semaine suivante"
                className="px-3"
              >
                →
              </Button>
            </div>
          </div>

          {!entries ? (
            <div className="flex items-center justify-center gap-3 py-20 text-sm text-ink-soft">
              <Spinner className="size-5" /> Chargement de l’agenda…
            </div>
          ) : (
            <>
              <WeekGrid
                weekStart={weekStart}
                entries={entries}
                selection={selection}
                onSelect={handleSelect}
                maxHoursFrom={maxHoursFrom}
              />
              <div className="mt-4 border-t border-line pt-4">
                <GridLegend />
              </div>
            </>
          )}
        </Card>

        {/* ---------------- Panneau ---------------- */}
        <div ref={panelRef} className="scroll-mt-24 lg:sticky lg:top-24 lg:self-start">
          <Card className="p-5">
            {success && (
              <div className="mb-4">
                <Alert tone="leaf">{success}</Alert>
              </div>
            )}

            {!selection || !start || !end ? (
              <div className="py-6 text-center">
                <p className="font-medium">Aucun créneau sélectionné</p>
                <p className="mt-1.5 text-sm text-ink-soft">
                  Les cases blanches sont libres. Cliquez sur l’heure de début souhaitée.
                </p>
              </div>
            ) : (
              <div className="space-y-5">
                <div>
                  <p className="text-xs tracking-wide text-ink-faint uppercase">Créneau</p>
                  <p className="mt-1 font-medium first-letter:uppercase">{formatDayLong(start)}</p>
                  <p className="text-sm text-ink-soft">
                    {formatTime(start)} → {formatTime(end)}
                  </p>
                </div>

                <div>
                  <p className="mb-2 text-xs tracking-wide text-ink-faint uppercase">Durée</p>
                  <div className="flex flex-wrap gap-1.5">
                    {Array.from({ length: maxHours }, (_, i) => i + 1).map((h) => (
                      <button
                        key={h}
                        onClick={() => setSelection({ ...selection, hours: h })}
                        className={cx(
                          'rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors',
                          selection.hours === h
                            ? 'border-accent bg-accent text-white'
                            : 'border-line-strong hover:bg-surface-alt',
                        )}
                      >
                        {h}h
                      </button>
                    ))}
                  </div>
                  {maxHours < MAX_BOOKING_HOURS && (
                    <p className="mt-2 text-xs text-ink-faint">
                      Limité par le créneau occupé suivant ou la fermeture à {CLOSING_HOUR}h.
                    </p>
                  )}
                </div>

                {options && options.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs tracking-wide text-ink-faint uppercase">
                      Options de cette salle
                    </p>
                    <div className="space-y-1.5">
                      {options.map((o) => {
                        const checked = chosenOptions.has(o.id)
                        return (
                          <label
                            key={o.id}
                            className={cx(
                              'flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 transition-colors',
                              checked ? 'border-accent-line bg-accent-soft' : 'border-line hover:bg-surface-alt',
                            )}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleOption(o.id)}
                              className="size-4 accent-[var(--color-accent)]"
                            />
                            <span className="flex-1 text-sm font-medium">{o.name}</span>
                            <span className="text-sm text-ink-soft">+{o.credit_cost}</span>
                          </label>
                        )
                      })}
                    </div>
                    <p className="mt-2 text-xs text-ink-faint">
                      Coût forfaitaire, quelle que soit la durée.
                    </p>
                  </div>
                )}

                <div className="space-y-1.5 border-t border-line pt-4 text-sm">
                  <div className="flex justify-between text-ink-soft">
                    <span>Salle · {selection.hours}h × {room.cost_per_hour}</span>
                    <span>{roomCost}</span>
                  </div>
                  {optionsCost > 0 && (
                    <div className="flex justify-between text-ink-soft">
                      <span>Options</span>
                      <span>{optionsCost}</span>
                    </div>
                  )}
                  <div className="flex justify-between pt-1.5 text-base font-semibold">
                    <span>Total</span>
                    <span>{formatCredits(totalCost)}</span>
                  </div>
                  <div className="flex justify-between text-ink-faint">
                    <span>Solde après réservation</span>
                    <span>{affordable ? balance - totalCost : '—'}</span>
                  </div>
                </div>

                {error && <Alert>{error}</Alert>}

                {!affordable ? (
                  <div className="space-y-3">
                    <Alert tone="amber">
                      Il vous manque {formatCredits(totalCost - balance)} pour cette réservation.
                    </Alert>
                    <Link
                      to="/credits"
                      className="block rounded-xl bg-accent px-4 py-2.5 text-center text-sm font-medium text-white hover:bg-accent-hover"
                    >
                      Acheter des crédits
                    </Link>
                  </div>
                ) : (
                  <Button full loading={busy} onClick={confirm} disabled={!room.is_available}>
                    Confirmer · {formatCredits(totalCost)}
                  </Button>
                )}

                <button
                  onClick={() => { setSelection(null); setChosenOptions(new Set()); setError(null) }}
                  className="w-full text-center text-sm text-ink-soft hover:text-ink"
                >
                  Annuler la sélection
                </button>
              </div>
            )}
          </Card>

          <p className="mt-3 px-1 text-xs text-ink-faint">
            Ouvert du lundi au vendredi, {WORK_DAYS.length} jours par semaine, de 8h à {CLOSING_HOUR}h.
            Réservations possibles jusqu’à {HORIZON_DAYS} jours à l’avance.
          </p>
        </div>
      </div>
    </>
  )
}
