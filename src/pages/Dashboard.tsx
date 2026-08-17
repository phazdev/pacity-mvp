import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useBookings } from '@/hooks/useBookings'
import { BookingList } from '@/components/BookingList'
import { Alert, Badge, Card, EmptyState, LinkButton, Loading, PageTitle, cx } from '@/components/ui'
import type { BookingDetail } from '@/lib/types'

type Tab = 'upcoming' | 'past' | 'cancelled'

const TABS: { key: Tab; label: string }[] = [
  { key: 'upcoming', label: 'À venir' },
  { key: 'past', label: 'Passées' },
  { key: 'cancelled', label: 'Annulées' },
]

function Tile({ label, value, hint, tone = 'neutral', action }: {
  label: string
  value: string
  hint?: string
  tone?: 'neutral' | 'accent' | 'amber'
  action?: React.ReactNode
}) {
  return (
    <Card className={cx(
      'p-5',
      tone === 'accent' && 'border-accent-line bg-accent-soft',
      tone === 'amber' && 'border-amber/25 bg-amber-soft',
    )}>
      <p className="text-sm text-ink-soft">{label}</p>
      <p className="mt-1.5 text-3xl font-semibold tracking-tight">{value}</p>
      {hint && <p className="mt-1 text-sm text-ink-soft">{hint}</p>}
      {action && <div className="mt-3">{action}</div>}
    </Card>
  )
}

export function Dashboard() {
  const { profile, isAdmin } = useAuth()
  const { bookings, error, reload } = useBookings()
  const [tab, setTab] = useState<Tab>('upcoming')

  const groups = useMemo(() => {
    const now = Date.now()
    const empty = { upcoming: [] as BookingDetail[], past: [] as BookingDetail[], cancelled: [] as BookingDetail[] }
    if (!bookings) return empty

    for (const b of bookings) {
      if (b.status === 'cancelled') empty.cancelled.push(b)
      else if (new Date(b.end_time).getTime() >= now) empty.upcoming.push(b)
      else empty.past.push(b)
    }
    // Les prochaines réservations d'abord ; l'historique du plus récent au plus ancien.
    empty.upcoming.sort((a, b) => a.start_time.localeCompare(b.start_time))
    return empty
  }, [bookings])

  const hoursThisMonth = useMemo(() => {
    if (!bookings) return 0
    const now = new Date()
    return bookings
      .filter((b) => {
        if (b.status !== 'confirmed') return false
        const d = new Date(b.start_time)
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
      })
      .reduce((sum, b) => sum + b.hours_count, 0)
  }, [bookings])

  const noCredits = (profile?.credits ?? 0) === 0

  return (
    <>
      <PageTitle
        title={isAdmin ? 'Tableau de bord du coworking' : `Bonjour ${profile?.name.split(' ')[0]}`}
        subtitle={
          isAdmin
            ? 'Toutes les réservations des membres, en temps réel.'
            : 'Vos réservations et votre solde de crédits.'
        }
        action={<LinkButton to="/salles">Réserver une salle</LinkButton>}
      />

      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <Tile
          label="Solde de crédits"
          value={String(profile?.credits ?? 0)}
          tone={noCredits ? 'amber' : 'accent'}
          hint={noCredits ? 'Aucune réservation possible sans crédits.' : 'Cumulables d’un mois sur l’autre.'}
          action={
            noCredits ? (
              <Link to="/credits" className="text-sm font-medium text-accent hover:underline">
                Acheter des crédits →
              </Link>
            ) : undefined
          }
        />
        <Tile
          label={isAdmin ? 'Réservations à venir' : 'Vos réservations à venir'}
          value={String(groups.upcoming.length)}
        />
        <Tile
          label="Heures réservées ce mois"
          value={`${hoursThisMonth}h`}
          hint={isAdmin ? 'Tous membres confondus.' : undefined}
        />
      </div>

      <div className="mb-4 flex items-center gap-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cx(
              'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
              tab === t.key ? 'bg-ink text-white' : 'text-ink-soft hover:bg-surface-alt',
            )}
          >
            {t.label}
            <span className={cx('ml-1.5', tab === t.key ? 'text-white/60' : 'text-ink-faint')}>
              {groups[t.key].length}
            </span>
          </button>
        ))}
      </div>

      {error && <Alert>{error}</Alert>}

      {!bookings ? (
        <Loading />
      ) : (
        <BookingList
          bookings={groups[tab]}
          showMember={isAdmin}
          canCancel={isAdmin}
          onChanged={reload}
          empty={
            <EmptyState
              title={
                tab === 'upcoming'
                  ? 'Aucune réservation à venir'
                  : tab === 'past'
                    ? 'Aucune réservation passée'
                    : 'Aucune annulation'
              }
              description={
                tab === 'upcoming'
                  ? isAdmin
                    ? 'Les prochaines réservations des membres apparaîtront ici.'
                    : 'Choisissez une salle et un créneau pour réserver.'
                  : undefined
              }
              action={
                tab === 'upcoming' && !isAdmin ? (
                  <Link to="/salles">
                    <Badge tone="accent" className="mt-1 px-3 py-1.5">Voir les salles →</Badge>
                  </Link>
                ) : undefined
              }
            />
          }
        />
      )}
    </>
  )
}
