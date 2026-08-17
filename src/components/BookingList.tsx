import { useState } from 'react'
import { supabase, errorMessage } from '@/lib/supabase'
import type { BookingDetail } from '@/lib/types'
import { formatDayLong, formatTime } from '@/lib/time'
import { formatCredits } from '@/lib/format'
import { Alert, Badge, Button, Card, Field, Input, Modal } from '@/components/ui'

function isPast(b: BookingDetail) {
  return new Date(b.end_time).getTime() < Date.now()
}

function StatusBadge({ booking }: { booking: BookingDetail }) {
  if (booking.status === 'cancelled') return <Badge tone="rust">Annulée</Badge>
  if (isPast(booking)) return <Badge tone="neutral">Terminée</Badge>
  return <Badge tone="leaf">Confirmée</Badge>
}

function BookingRow({
  booking, showMember, onCancel,
}: {
  booking: BookingDetail
  showMember: boolean
  onCancel?: (b: BookingDetail) => void
}) {
  const start = new Date(booking.start_time)
  const end = new Date(booking.end_time)
  const options = booking.booking_options ?? []
  const cancellable = booking.status === 'confirmed' && !isPast(booking)

  return (
    <div className="flex flex-wrap items-start gap-4 px-5 py-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{booking.rooms?.name ?? 'Salle supprimée'}</span>
          <StatusBadge booking={booking} />
          {showMember && booking.profiles && (
            <span className="text-sm text-ink-soft">· {booking.profiles.name}</span>
          )}
        </div>

        <p className="mt-1 text-sm text-ink-soft first-letter:uppercase">
          {formatDayLong(start)} · {formatTime(start)} → {formatTime(end)}
        </p>

        {options.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {options.map((o) => (
              <Badge key={o.option_id} tone="accent">
                {o.options?.name ?? 'Option'}
              </Badge>
            ))}
          </div>
        )}

        {booking.status === 'cancelled' && booking.cancellation_reason && (
          <p className="mt-2 text-sm text-rust">Motif : {booking.cancellation_reason}</p>
        )}
      </div>

      <div className="flex items-center gap-4">
        <div className="text-right">
          <p className="font-medium">{formatCredits(booking.total_cost)}</p>
          <p className="text-xs text-ink-faint">
            {booking.hours_count}h × salle
            {booking.options_cost > 0 && ` + ${booking.options_cost} opt.`}
          </p>
        </div>

        {onCancel && cancellable && (
          <Button variant="secondary" onClick={() => onCancel(booking)}>
            Annuler
          </Button>
        )}
      </div>
    </div>
  )
}

export function BookingList({
  bookings, showMember = false, canCancel = false, onChanged, empty,
}: {
  bookings: BookingDetail[]
  showMember?: boolean
  canCancel?: boolean
  onChanged?: () => void
  empty: React.ReactNode
}) {
  const [target, setTarget] = useState<BookingDetail | null>(null)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (bookings.length === 0) return <>{empty}</>

  const confirmCancel = async () => {
    if (!target) return
    setBusy(true)
    setError(null)
    const { error } = await supabase.rpc('cancel_booking', {
      p_booking_id: target.id,
      p_reason: reason.trim() || null,
    })
    setBusy(false)
    if (error) {
      setError(errorMessage(error))
      return
    }
    setTarget(null)
    setReason('')
    onChanged?.()
  }

  return (
    <>
      <Card className="divide-y divide-line overflow-hidden">
        {bookings.map((b) => (
          <BookingRow
            key={b.id}
            booking={b}
            showMember={showMember}
            onCancel={canCancel ? setTarget : undefined}
          />
        ))}
      </Card>

      <Modal
        open={target !== null}
        onClose={() => { setTarget(null); setError(null) }}
        title="Annuler cette réservation"
      >
        {target && (
          <div className="space-y-5">
            <div className="rounded-xl bg-surface-alt px-4 py-3 text-sm">
              <p className="font-medium">{target.rooms?.name}</p>
              <p className="mt-0.5 text-ink-soft first-letter:uppercase">
                {formatDayLong(new Date(target.start_time))} ·{' '}
                {formatTime(new Date(target.start_time))} → {formatTime(new Date(target.end_time))}
              </p>
              {target.profiles && (
                <p className="mt-0.5 text-ink-soft">Réservée par {target.profiles.name}</p>
              )}
            </div>

            <p className="text-sm text-ink-soft">
              {formatCredits(target.total_cost)} seront recrédités immédiatement sur le
              compte du membre, et le créneau redeviendra réservable.
            </p>

            <Field label="Motif" hint="Visible par le membre dans son historique.">
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Salle indisponible, demande du membre…"
                autoFocus
              />
            </Field>

            {error && <Alert>{error}</Alert>}

            <div className="flex gap-3">
              <Button variant="secondary" full onClick={() => setTarget(null)}>
                Revenir
              </Button>
              <Button variant="danger" full loading={busy} onClick={confirmCancel}>
                Annuler et rembourser
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}
