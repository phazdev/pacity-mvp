import { useCallback, useEffect, useState } from 'react'
import { supabase, errorMessage } from '@/lib/supabase'
import { useRooms } from '@/hooks/useCatalog'
import { CLOSING_HOUR, CLOSURE_REASONS, HOURS, SUBSCRIPTION_LABEL } from '@/lib/business'
import { formatCredits } from '@/lib/format'
import { formatDayLong, formatTime, parisParts, parisWallToUtc } from '@/lib/time'
import type { Profile, Room, RoomClosure } from '@/lib/types'
import {
  Alert, Badge, Button, Card, EmptyState, Field, Input, Loading, Modal, PageTitle, Select, cx,
} from '@/components/ui'

type Tab = 'rooms' | 'members'

/* ================================================================== */
/* Fermetures                                                          */
/* ================================================================== */

function ClosureForm({ rooms, onDone }: { rooms: Room[]; onDone: () => void }) {
  const todayIso = (() => {
    const p = parisParts(new Date())
    return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`
  })()

  const [roomId, setRoomId] = useState(rooms[0]?.id ?? '')
  const [date, setDate] = useState(todayIso)
  const [startHour, setStartHour] = useState(14)
  const [endHour, setEndHour] = useState(18)
  const [reason, setReason] = useState<string>(CLOSURE_REASONS[0])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setResult(null)

    if (endHour <= startHour) {
      setError('L’heure de fin doit être postérieure à l’heure de début.')
      return
    }

    setBusy(true)
    const [y, m, d] = date.split('-').map(Number)
    const { data, error } = await supabase.rpc('close_room', {
      p_room_id: roomId,
      p_start: parisWallToUtc(y, m, d, startHour).toISOString(),
      p_end: parisWallToUtc(y, m, d, endHour).toISOString(),
      p_reason: reason,
    })
    setBusy(false)

    if (error) {
      setError(errorMessage(error))
      return
    }

    const cancelled = (data as number) ?? 0
    setResult(
      cancelled === 0
        ? 'Créneau fermé. Aucune réservation n’était concernée.'
        : `Créneau fermé. ${cancelled} réservation(s) annulée(s) et remboursée(s).`,
    )
    onDone()
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Salle">
        <Select value={roomId} onChange={(e) => setRoomId(e.target.value)}>
          {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </Select>
      </Field>

      <Field label="Date">
        <Input type="date" value={date} min={todayIso} onChange={(e) => setDate(e.target.value)} required />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="De">
          <Select value={startHour} onChange={(e) => setStartHour(Number(e.target.value))}>
            {HOURS.map((h) => <option key={h} value={h}>{h}h00</option>)}
          </Select>
        </Field>
        <Field label="À">
          <Select value={endHour} onChange={(e) => setEndHour(Number(e.target.value))}>
            {HOURS.slice(1).concat(CLOSING_HOUR).map((h) => <option key={h} value={h}>{h}h00</option>)}
          </Select>
        </Field>
      </div>

      <Field label="Motif">
        <Select value={reason} onChange={(e) => setReason(e.target.value)}>
          {CLOSURE_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
        </Select>
      </Field>

      {error && <Alert>{error}</Alert>}
      {result && <Alert tone="leaf">{result}</Alert>}

      <Alert tone="amber">
        Les réservations existantes sur ce créneau seront annulées et intégralement
        remboursées.
      </Alert>

      <Button type="submit" full loading={busy}>Fermer le créneau</Button>
    </form>
  )
}

function RoomsTab() {
  const rooms = useRooms()
  const [closures, setClosures] = useState<RoomClosure[] | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadClosures = useCallback(async () => {
    const { data } = await supabase
      .from('room_closures')
      .select('*')
      .order('start_time', { ascending: true })
    setClosures((data ?? []) as RoomClosure[])
  }, [])

  useEffect(() => { void loadClosures() }, [loadClosures])

  const toggleRoom = async (room: Room) => {
    setError(null)
    const { error } = await supabase
      .from('rooms')
      .update({ is_available: !room.is_available })
      .eq('id', room.id)
    if (error) setError(errorMessage(error))
    else window.location.reload()
  }

  const removeClosure = async (id: string) => {
    setError(null)
    const { error } = await supabase.rpc('delete_closure', { p_closure_id: id })
    if (error) setError(errorMessage(error))
    else void loadClosures()
  }

  if (!rooms) return <Loading />

  const roomName = (id: string) => rooms.find((r) => r.id === id)?.name ?? 'Salle'

  return (
    <div className="space-y-8">
      {error && <Alert>{error}</Alert>}

      <section>
        <h2 className="mb-3 text-lg font-semibold tracking-tight">Parc de salles</h2>
        <Card className="divide-y divide-line overflow-hidden">
          {rooms.map((room) => (
            <div key={room.id} className="flex items-center gap-4 px-5 py-4">
              <div className="flex-1">
                <p className="font-medium">{room.name}</p>
                <p className="text-sm text-ink-soft">
                  {room.capacity} pers · {room.type_label} · {formatCredits(room.cost_per_hour)}/h
                </p>
              </div>
              <Badge tone={room.is_available ? 'leaf' : 'rust'}>
                {room.is_available ? 'En service' : 'Hors service'}
              </Badge>
              <Button variant="secondary" onClick={() => toggleRoom(room)}>
                {room.is_available ? 'Mettre hors service' : 'Remettre en service'}
              </Button>
            </div>
          ))}
        </Card>
        <p className="mt-2 text-xs text-ink-faint">
          « Hors service » retire la salle durablement. Pour une indisponibilité datée
          (travaux, privatisation), utilisez une fermeture ci-dessous.
        </p>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">Fermetures programmées</h2>
          <Button onClick={() => setModalOpen(true)}>Fermer un créneau</Button>
        </div>

        {!closures ? (
          <Loading />
        ) : closures.length === 0 ? (
          <EmptyState
            title="Aucune fermeture programmée"
            description="Fermez un créneau pour des travaux, une fuite ou une privatisation."
          />
        ) : (
          <Card className="divide-y divide-line overflow-hidden">
            {closures.map((c) => {
              const start = new Date(c.start_time)
              const past = new Date(c.end_time).getTime() < Date.now()
              return (
                <div key={c.id} className={cx('flex items-center gap-4 px-5 py-4', past && 'opacity-55')}>
                  <div className="flex-1">
                    <p className="font-medium">{roomName(c.room_id)}</p>
                    <p className="text-sm text-ink-soft first-letter:uppercase">
                      {formatDayLong(start)} · {formatTime(start)} → {formatTime(new Date(c.end_time))}
                    </p>
                  </div>
                  <Badge tone="amber">{c.reason}</Badge>
                  <Button variant="ghost" onClick={() => removeClosure(c.id)}>
                    Lever
                  </Button>
                </div>
              )
            })}
          </Card>
        )}
      </section>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Fermer un créneau">
        <ClosureForm rooms={rooms} onDone={loadClosures} />
      </Modal>
    </div>
  )
}

/* ================================================================== */
/* Membres                                                             */
/* ================================================================== */

function MembersTab() {
  const [members, setMembers] = useState<Profile[] | null>(null)
  const [target, setTarget] = useState<Profile | null>(null)
  const [amount, setAmount] = useState('10')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data } = await supabase.from('profiles').select('*').order('name')
    setMembers((data ?? []) as Profile[])
  }, [])

  useEffect(() => { void load() }, [load])

  const adjust = async () => {
    if (!target) return
    const value = Number(amount)
    if (!Number.isInteger(value) || value === 0) {
      setError('Saisissez un nombre entier non nul (négatif pour retirer).')
      return
    }
    setBusy(true)
    setError(null)

    const { error } = await supabase.rpc('admin_adjust_credits', {
      p_user_id: target.id,
      p_amount: value,
      p_description: reason.trim() || null,
    })
    setBusy(false)

    if (error) {
      setError(errorMessage(error))
      return
    }
    setTarget(null)
    setReason('')
    void load()
  }

  const runRenewal = async () => {
    setNotice(null)
    setError(null)
    const { data, error } = await supabase.rpc('run_monthly_renewal')
    if (error) {
      setError(errorMessage(error))
      return
    }
    const n = (data as number) ?? 0
    setNotice(
      n === 0
        ? 'Aucun versement : la dotation de ce mois a déjà été distribuée.'
        : `${n} membre(s) crédité(s) de leur dotation mensuelle.`,
    )
    void load()
  }

  if (!members) return <Loading />

  return (
    <div className="space-y-6">
      <Card className="flex flex-wrap items-center justify-between gap-4 p-5">
        <div>
          <p className="font-medium">Dotation mensuelle</p>
          <p className="mt-0.5 text-sm text-ink-soft">
            Versée automatiquement le 1er du mois. Ce bouton la déclenche manuellement —
            sans risque de double versement.
          </p>
        </div>
        <Button variant="secondary" onClick={runRenewal}>Forcer le renouvellement</Button>
      </Card>

      {notice && <Alert tone="leaf">{notice}</Alert>}
      {error && <Alert>{error}</Alert>}

      <Card className="divide-y divide-line overflow-hidden">
        {members.map((m) => (
          <div key={m.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 font-medium">
                {m.name}
                {m.role === 'admin' && <Badge tone="accent">Gérant</Badge>}
              </p>
              <p className="truncate text-sm text-ink-soft">{m.email}</p>
            </div>
            <Badge tone={m.subscription_type === 'FULL_TIME' ? 'leaf' : 'neutral'}>
              {SUBSCRIPTION_LABEL[m.subscription_type]}
            </Badge>
            <div className="w-20 text-right">
              <p className="font-semibold tabular-nums">{m.credits}</p>
              <p className="text-xs text-ink-faint">crédits</p>
            </div>
            <Button variant="secondary" onClick={() => { setTarget(m); setAmount('10'); setError(null) }}>
              Créditer
            </Button>
          </div>
        ))}
      </Card>

      <Modal open={target !== null} onClose={() => setTarget(null)} title="Ajuster le solde">
        {target && (
          <div className="space-y-4">
            <p className="text-sm text-ink-soft">
              {target.name} dispose actuellement de {formatCredits(target.credits)}.
            </p>

            <Field label="Montant" hint="Positif pour créditer, négatif pour retirer.">
              <Input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                step={1}
                autoFocus
              />
            </Field>

            <Field label="Motif">
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Geste commercial, correction…"
              />
            </Field>

            {error && <Alert>{error}</Alert>}

            <div className="flex gap-3">
              <Button variant="secondary" full onClick={() => setTarget(null)}>Annuler</Button>
              <Button full loading={busy} onClick={adjust}>Enregistrer</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

/* ================================================================== */

export function Management() {
  const [tab, setTab] = useState<Tab>('rooms')

  return (
    <>
      <PageTitle
        title="Gestion"
        subtitle="Parc de salles, fermetures et comptes membres."
      />

      <div className="mb-6 flex gap-1">
        {([['rooms', 'Salles & fermetures'], ['members', 'Membres']] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cx(
              'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
              tab === key ? 'bg-ink text-white' : 'text-ink-soft hover:bg-surface-alt',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'rooms' ? <RoomsTab /> : <MembersTab />}
    </>
  )
}
