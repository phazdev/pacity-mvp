import { useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { errorMessage } from '@/lib/supabase'
import { Alert, Button, Card, Field, Input } from '@/components/ui'

const DEMO_ACCOUNTS = [
  { email: 'pierre@pacity.fr', label: 'Pierre', role: 'Membre Full Time' },
  { email: 'sophie@pacity.fr', label: 'Sophie', role: 'Membre Nomad, 0 crédit' },
  { email: 'mathieu@pacity.fr', label: 'Mathieu', role: 'Gérant' },
]
const DEMO_PASSWORD = 'Pacity2026!'

export function AuthPage() {
  const { signIn, signUp } = useAuth()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const isSignup = mode === 'signup'

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      if (isSignup) await signUp(email.trim(), password, name.trim())
      else await signIn(email.trim(), password)
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  const switchMode = () => {
    setMode(isSignup ? 'signin' : 'signup')
    setError(null)
  }

  const fillDemo = (demoEmail: string) => {
    setMode('signin')
    setEmail(demoEmail)
    setPassword(DEMO_PASSWORD)
    setError(null)
  }

  return (
    <div className="grid min-h-full lg:grid-cols-2">
      {/* Volet de présentation */}
      <div className="hidden flex-col justify-between bg-accent p-12 text-white lg:flex">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-lg bg-white/15 font-bold">P</span>
          <span className="text-xl font-semibold tracking-tight">Pacity</span>
        </div>

        <div className="max-w-md">
          <h1 className="text-4xl leading-tight font-semibold tracking-tight">
            Vos salles de réunion, réservées en deux clics.
          </h1>
          <p className="mt-5 text-white/80">
            Fini les allers-retours entre Google Calendar et Slack. Consultez les
            disponibilités en temps réel, réservez, et suivez vos crédits au même endroit.
          </p>
        </div>

        <p className="text-sm text-white/60">Coworking citadin · Espace membres</p>
      </div>

      {/* Formulaire */}
      <div className="flex items-center justify-center px-4 py-12 sm:px-8">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <span className="grid size-10 place-items-center rounded-xl bg-accent font-bold text-white">P</span>
          </div>

          <h2 className="text-2xl font-semibold tracking-tight">
            {isSignup ? 'Créer un compte' : 'Bon retour parmi nous'}
          </h2>
          <p className="mt-1.5 text-sm text-ink-soft">
            {isSignup
              ? 'Votre compte démarre en Nomad. Vous pourrez acheter des crédits ou vous abonner ensuite.'
              : 'Connectez-vous pour accéder à vos réservations.'}
          </p>

          <form onSubmit={submit} className="mt-7 space-y-4">
            {isSignup && (
              <Field label="Nom complet">
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Camille Bernard"
                  autoComplete="name"
                  required
                />
              </Field>
            )}

            <Field label="Email">
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="vous@exemple.fr"
                autoComplete="email"
                required
              />
            </Field>

            <Field label="Mot de passe" hint={isSignup ? '6 caractères minimum.' : undefined}>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete={isSignup ? 'new-password' : 'current-password'}
                minLength={6}
                required
              />
            </Field>

            {error && <Alert>{error}</Alert>}

            <Button type="submit" full loading={busy}>
              {isSignup ? 'Créer mon compte' : 'Se connecter'}
            </Button>
          </form>

          <p className="mt-5 text-center text-sm text-ink-soft">
            {isSignup ? 'Vous avez déjà un compte ?' : 'Pas encore de compte ?'}{' '}
            <button onClick={switchMode} className="font-medium text-accent hover:underline">
              {isSignup ? 'Se connecter' : 'Créer un compte'}
            </button>
          </p>

          <Card className="mt-8 p-4">
            <p className="text-xs font-medium tracking-wide text-ink-faint uppercase">
              Comptes de démonstration
            </p>
            <div className="mt-3 space-y-1">
              {DEMO_ACCOUNTS.map((a) => (
                <button
                  key={a.email}
                  onClick={() => fillDemo(a.email)}
                  className="flex w-full items-baseline justify-between gap-3 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-surface-alt"
                >
                  <span className="text-sm font-medium">{a.label}</span>
                  <span className="text-xs text-ink-faint">{a.role}</span>
                </button>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
