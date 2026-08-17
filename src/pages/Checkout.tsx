import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { supabase, errorMessage } from '@/lib/supabase'
import { formatCredits, formatPrice } from '@/lib/format'
import type { Order } from '@/lib/types'
import { Alert, Badge, Button, Card, Loading } from '@/components/ui'

export function Checkout() {
  const { orderId } = useParams<{ orderId: string }>()
  const { profile, refreshProfile } = useAuth()
  const navigate = useNavigate()

  const [order, setOrder] = useState<Order | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!orderId) return
    void supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .maybeSingle()
      .then(({ data }) => setOrder(data as Order | null))
  }, [orderId])

  const pay = async () => {
    if (!orderId) return
    setBusy(true)
    setError(null)

    // Aujourd'hui : appel direct. Demain : redirection Stripe Checkout,
    // et c'est le webhook qui appellera fulfill_order — la fonction est
    // idempotente, donc rejouable sans risque de double crédit.
    const { error } = await supabase.rpc('fulfill_order', {
      p_order_id: orderId,
      p_provider_ref: `simulated-${Date.now()}`,
    })

    setBusy(false)
    if (error) {
      setError(errorMessage(error))
      return
    }

    setDone(true)
    await refreshProfile()
  }

  if (order === undefined) return <Loading label="Chargement de la commande…" />
  if (order === null) {
    return (
      <Alert>
        Commande introuvable. <Link to="/credits" className="underline">Retour aux crédits</Link>
      </Alert>
    )
  }

  const alreadyPaid = order.status === 'paid'

  return (
    <div className="mx-auto max-w-md">
      <Link to="/credits" className="text-sm font-medium text-ink-soft hover:text-ink">
        ← Retour
      </Link>

      <Card className="mt-4 p-6">
        {done || alreadyPaid ? (
          <div className="py-4 text-center">
            <div className="mx-auto grid size-12 place-items-center rounded-full bg-leaf-soft">
              <svg viewBox="0 0 20 20" className="size-6 text-leaf" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 10.5l3.5 3.5L15 7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h1 className="mt-4 text-xl font-semibold tracking-tight">Paiement confirmé</h1>
            <p className="mt-1.5 text-sm text-ink-soft">
              {formatCredits(order.credits_granted)} ont été ajoutés à votre compte.
            </p>
            <p className="mt-4 text-3xl font-semibold text-accent">{profile?.credits ?? 0}</p>
            <p className="text-sm text-ink-soft">crédits disponibles</p>

            <div className="mt-6 flex gap-3">
              <Button variant="secondary" full onClick={() => navigate('/credits')}>
                Mes crédits
              </Button>
              <Button full onClick={() => navigate('/salles')}>
                Réserver une salle
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h1 className="text-xl font-semibold tracking-tight">Valider le paiement</h1>
                <p className="mt-1 text-sm text-ink-soft">
                  Vérifiez votre commande avant de confirmer.
                </p>
              </div>
              <Badge tone="amber">Paiement simulé</Badge>
            </div>

            <div className="mt-6 space-y-3 rounded-xl bg-surface-alt p-4 text-sm">
              <div className="flex justify-between">
                <span className="text-ink-soft">Article</span>
                <span className="font-medium">{order.label}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-soft">Crédits ajoutés</span>
                <span className="font-medium">+{order.credits_granted}</span>
              </div>
              {order.kind === 'SUBSCRIPTION' && (
                <div className="flex justify-between">
                  <span className="text-ink-soft">Abonnement</span>
                  <span className="font-medium">Full Time, renouvelé chaque mois</span>
                </div>
              )}
              <div className="flex justify-between border-t border-line-strong pt-3 text-base">
                <span className="font-medium">À régler</span>
                <span className="font-semibold">{formatPrice(order.amount_cents)}</span>
              </div>
            </div>

            <div className="mt-4 flex justify-between text-sm text-ink-soft">
              <span>Solde actuel</span>
              <span>
                {profile?.credits ?? 0} → {(profile?.credits ?? 0) + order.credits_granted}
              </span>
            </div>

            {error && <div className="mt-4"><Alert>{error}</Alert></div>}

            <Button className="mt-6" full loading={busy} onClick={pay}>
              Valider le paiement · {formatPrice(order.amount_cents)}
            </Button>

            <p className="mt-4 text-center text-xs text-ink-faint">
              Aucun paiement réel n’est effectué. Le parcours de commande est complet et
              prêt à recevoir un prestataire de paiement.
            </p>
          </>
        )}
      </Card>
    </div>
  )
}
