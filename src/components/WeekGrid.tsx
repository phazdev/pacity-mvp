import { useMemo } from 'react'
import type { ScheduleEntry } from '@/lib/types'
import { HOURS, WORK_DAYS } from '@/lib/business'
import { dayOfWeek, formatDayNum, formatDayShort, isSameParisDay, slotInstant } from '@/lib/time'
import { cx } from '@/components/ui'

export type CellState = 'free' | 'past' | 'occupied' | 'mine' | 'closed'

export interface Selection {
  dayIndex: number
  hour: number
  hours: number
}

interface Cell {
  state: CellState
  label: string | null
  /** Première heure d'un bloc : c'est elle qui porte le libellé. */
  isBlockStart: boolean
}

/**
 * Construit l'état de chaque case en interrogeant l'occupation par
 * instant plutôt qu'en projetant les réservations sur la grille.
 * C'est plus robuste : aucun calcul de fuseau à faire à l'envers, et les
 * réservations qui débordent de la semaine affichée sont gérées seules.
 */
function buildCells(weekStart: Date, entries: ScheduleEntry[]): Map<string, Cell> {
  const ranges = entries.map((e) => ({
    from: new Date(e.start_time).getTime(),
    to: new Date(e.end_time).getTime(),
    entry: e,
  }))
  const now = Date.now()
  const cells = new Map<string, Cell>()

  for (const dayIndex of WORK_DAYS) {
    for (const hour of HOURS) {
      const t = slotInstant(weekStart, dayIndex, hour).getTime()
      const hit = ranges.find((r) => r.from <= t && r.to > t)

      let state: CellState = 'free'
      let label: string | null = null

      if (hit) {
        state = hit.entry.kind === 'closure' ? 'closed' : hit.entry.is_mine ? 'mine' : 'occupied'
        label = hit.entry.label
      } else if (t < now) {
        state = 'past'
      }

      cells.set(`${dayIndex}-${hour}`, {
        state,
        label,
        isBlockStart: hit ? hit.from === t : false,
      })
    }
  }
  return cells
}

const CELL_STYLES: Record<CellState, string> = {
  free: 'bg-surface hover:bg-accent-soft hover:ring-1 hover:ring-accent-line cursor-pointer',
  past: 'bg-surface-alt/60 cursor-not-allowed',
  occupied: 'bg-surface-alt cursor-not-allowed',
  mine: 'bg-leaf-soft cursor-not-allowed',
  closed: 'hatched cursor-not-allowed',
}

export function WeekGrid({
  weekStart, entries, selection, onSelect, maxHoursFrom,
}: {
  weekStart: Date
  entries: ScheduleEntry[]
  selection: Selection | null
  onSelect: (dayIndex: number, hour: number) => void
  /** Nombre d'heures libres consécutives depuis ce créneau. */
  maxHoursFrom: (dayIndex: number, hour: number) => number
}) {
  const cells = useMemo(() => buildCells(weekStart, entries), [weekStart, entries])
  const today = new Date()

  const isSelected = (dayIndex: number, hour: number) =>
    selection !== null &&
    selection.dayIndex === dayIndex &&
    hour >= selection.hour &&
    hour < selection.hour + selection.hours

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[640px]">
        {/* En-tête des jours */}
        <div className="grid grid-cols-[4rem_repeat(5,1fr)] gap-1">
          <div />
          {WORK_DAYS.map((dayIndex) => {
            const d = dayOfWeek(weekStart, dayIndex)
            const isToday = isSameParisDay(d, today)
            return (
              <div
                key={dayIndex}
                className={cx(
                  'rounded-lg py-2 text-center',
                  isToday && 'bg-accent-soft',
                )}
              >
                <p className={cx(
                  'text-xs font-medium tracking-wide uppercase',
                  isToday ? 'text-accent' : 'text-ink-faint',
                )}>
                  {formatDayShort(d)}
                </p>
                <p className={cx('text-sm font-medium', isToday && 'text-accent')}>
                  {formatDayNum(d)}
                </p>
              </div>
            )
          })}
        </div>

        {/* Lignes horaires */}
        <div className="mt-1 space-y-1">
          {HOURS.map((hour) => (
            <div key={hour} className="grid grid-cols-[4rem_repeat(5,1fr)] gap-1">
              <div className="flex items-center justify-end pr-2 text-xs text-ink-faint tabular-nums">
                {String(hour).padStart(2, '0')}:00
              </div>

              {WORK_DAYS.map((dayIndex) => {
                const cell = cells.get(`${dayIndex}-${hour}`)!
                const selected = isSelected(dayIndex, hour)
                const clickable = cell.state === 'free' && maxHoursFrom(dayIndex, hour) > 0

                return (
                  <button
                    key={dayIndex}
                    type="button"
                    disabled={!clickable}
                    onClick={() => onSelect(dayIndex, hour)}
                    aria-label={`${formatDayShort(dayOfWeek(weekStart, dayIndex))} ${hour}h — ${
                      cell.state === 'free' ? 'libre' :
                      cell.state === 'past' ? 'passé' :
                      cell.state === 'closed' ? `fermé : ${cell.label}` :
                      cell.state === 'mine' ? 'votre réservation' : 'occupé'
                    }`}
                    className={cx(
                      'h-11 rounded-lg border border-line px-2 text-left text-xs transition-all',
                      selected
                        ? 'border-accent bg-accent text-white ring-2 ring-accent/25'
                        : CELL_STYLES[cell.state],
                    )}
                  >
                    {cell.isBlockStart && cell.label && !selected && (
                      <span className={cx(
                        'line-clamp-2 font-medium',
                        cell.state === 'closed' && 'text-amber',
                        cell.state === 'mine' && 'text-leaf',
                        cell.state === 'occupied' && 'text-ink-soft',
                      )}>
                        {cell.label}
                      </span>
                    )}
                    {selected && hour === selection?.hour && (
                      <span className="font-medium">Sélection</span>
                    )}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function GridLegend() {
  const items: { state: CellState; label: string }[] = [
    { state: 'free', label: 'Libre' },
    { state: 'occupied', label: 'Occupé' },
    { state: 'mine', label: 'Ma réservation' },
    { state: 'closed', label: 'Fermé' },
    { state: 'past', label: 'Passé' },
  ]
  return (
    <div className="flex flex-wrap items-center gap-4 text-xs text-ink-soft">
      {items.map((i) => (
        <span key={i.state} className="flex items-center gap-1.5">
          <span className={cx('size-3 rounded border border-line', CELL_STYLES[i.state].split(' ')[0])} />
          {i.label}
        </span>
      ))}
    </div>
  )
}
