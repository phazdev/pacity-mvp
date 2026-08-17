import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useCreditPacks, useSubscriptionPlan } from '@/hooks/useCatalog'
import { supabase, errorMessage } from '@/lib/supabase'
import { TRANSACTION_LABEL, SUBSCRIPTION_LABEL } from '@/lib/business'
import { formatCredits, formatPrice, formatSigned, formatUnitPrice } from '@/lib/format'
import { formatDateTime } from '@/lib/time'
import type { CreditTransaction } from '@/lib/types'
import { Alert, Badge, Button, Card, EmptyState, Loading, PageTitle, cx } from '@/components/ui'

function useTransactions() {
  const [rows, setRows] = useState<CreditTransaction[] | null>(null)

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('credit_transactions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100)
    setRows((data ?? []) as CreditTransaction[])
  }, [])

  useEffect(() => { void load() }, [load])

  // Le ledger est publié en Realtime : un remboursement décidé par le
  // gérant apparaît ici sans rechargement.
  useEffect(() => {
    const channel = supabase
      .channel('ledger-feed')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'credit_transactions' },
        () => { void load() },
      )
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [load])

  return rows
}

export function Credits() {
  const { profile } = useAuth()
  const packs = useCreditPacks()
  const plan = useSubscriptionPlan('FULL_TIME')
  const transactions = useTransactions()
  const navigate = useNavigate()

  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const isNomad = profile?.subscription_type === 'NOMAD'

  const order = async (kind: 'CREDIT_PACK' | 'SUBSCRIPTION', packId?: string) => {
    setBusyId(packId ?? 'subscription')
    setError(null)

    const { data, error } = await supabase.rpc('create_order', {
      p_kind: kind,
      p_pack_id: packId ?? null,
    })

    setBusyId(null)
    if (error) {
      setError(errorMessage(error))
      return
    }
    navigate(`/credits/paiement/${data as string}`)
  }

  return (
    <>
      <PageTitle
        title="Mes crédits"
        subtitle="Votre solde, vos achats et l’historique complet de vos mouvements."
      />

      {/* Solde */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2">
        <Card className="border-accent-line bg-accent-soft p-6">
          <p className="text-sm text-accent/80">Solde disponible</p>
          <p className="mt-1 text-4xl font-semibold tracking-tight text-accent">
            {profile?.credits ?? 0}
          </p>
          <p className="mt-1.5 text-sm text-accent/70">
            Les crédits se cumulent d’un mois sur l’autre et n’expirent pas.
          </p>
        </Card>

        <Card className="flex flex-col justify-between p-6">
          <div>
            <p className="text-sm text-ink-soft">Votre abonnement</p>
            <p className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight">
              {SUBSCRIPTION_LABEL[profile?.subscription_type ?? 'NOMAD']}
              {!isNomad && <Badge tone="leaf">20 crédits / mois</Badge>}
            </p>
            <p className="mt-1.5 text-sm text-ink-soft">
              {isNomad
                ? 'Aucun crédit mensuel inclus. Achetez à la carte ou passez Full Time.'
                : 'Votre dotation est versée automatiquement le 1er de chaque mois.'}
            </p>
          </div>

          {isNomad && plan && (
            <Button
              className="mt-4"
              loading={busyId === 'subscription'}
              onClick={() => order('SUBSCRIPTION')}
            >
              Passer Full Time · {formatPrice(plan.price_cents)}/mois
            </Button>
          )}
        </Card>
      </div>

      {error && <div className="mb-6"><Alert>{error}</Alert></div>}

      {/* Packs */}
      <h2 className="mb-1 text-lg font-semibold tracking-tight">Recharger mon compte</h2>
      <p className="mb-4 text-sm text-ink-soft">
        Sans engagement. Les crédits achetés s’ajoutent à votre solde et n’expirent pas.
      </p>

      {!packs ? (
        <Loading label="Chargement des offres…" />
      ) : (
        <div className="grid gap-4 sm:grid-cols-3">
          {packs.map((pack, i) => {
            const best = i === packs.length - 1
            return (
              <Card
                key={pack.id}
                className={cx('flex flex-col p-5', best && 'border-accent-line ring-1 ring-accent-line')}
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold">{pack.name}</h3>
                  {best && <Badge tone="accent">Meilleur tarif</Badge>}
                </div>

                <p className="mt-3 text-3xl font-semibold tracking-tight">{pack.credits}</p>
                <p className="text-sm text-ink-soft">crédits</p>

                <div className="mt-4 border-t border-line pt-4">
                  <p className="text-xl font-semibold">{formatPrice(pack.price_cents)}</p>
                  <p className="text-xs text-ink-faint">
                    {formatUnitPrice(pack.price_cents, pack.credits)}
                  </p>
                </div>

                <Button
                  variant={best ? 'primary' : 'secondary'}
                  className="mt-4"
                  full
                  loading={busyId === pack.id}
                  onClick={() => order('CREDIT_PACK', pack.id)}
                >
                  Choisir
                </Button>
              </Card>
            )
          })}
        </div>
      )}

      {/* Historique */}
      <h2 className="mt-10 mb-4 text-lg font-semibold tracking-tight">Historique des mouvements</h2>

      {!transactions ? (
        <Loading />
      ) : transactions.length === 0 ? (
        <EmptyState title="Aucun mouvement pour l’instant" />
      ) : (
        <Card className="divide-y divide-line overflow-hidden">
          {transactions.map((t) => (
            <div key={t.id} className="flex items-center gap-4 px-5 py-3.5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {TRANSACTION_LABEL[t.type] ?? t.type}
                </p>
                <p className="truncate text-sm text-ink-soft">
                  {t.description ?? '—'}
                </p>
              </div>
              <div className="text-right">
                <p className={cx(
                  'font-semibold tabular-nums',
                  t.amount > 0 ? 'text-leaf' : 'text-ink',
                )}>
                  {formatSigned(t.amount)}
                </p>
                <p className="text-xs text-ink-faint">
                  {formatDateTime(new Date(t.created_at))}
                </p>
              </div>
            </div>
          ))}
        </Card>
      )}

      <p className="mt-4 text-xs text-ink-faint">
        {formatCredits(profile?.credits ?? 0)} au total. Cet historique est immuable :
        toute correction fait l’objet d’un mouvement inverse, jamais d’une modification.
      </p>
    </>
  )
}
