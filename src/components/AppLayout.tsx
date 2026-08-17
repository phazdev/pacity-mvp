import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { Badge, Button, cx } from '@/components/ui'
import { SUBSCRIPTION_LABEL } from '@/lib/business'
import { formatCredits } from '@/lib/format'

function Logo() {
  return (
    <span className="flex items-center gap-2.5">
      <span className="grid size-8 place-items-center rounded-lg bg-accent text-sm font-bold text-white">
        P
      </span>
      <span className="text-lg font-semibold tracking-tight">Pacity</span>
    </span>
  )
}

function NavItem({ to, children, end }: { to: string; children: string; end?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cx(
          'shrink-0 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors',
          isActive ? 'bg-accent-soft text-accent' : 'text-ink-soft hover:bg-surface-alt hover:text-ink',
        )
      }
    >
      {children}
    </NavLink>
  )
}

export function AppLayout() {
  const { profile, isAdmin, signOut } = useAuth()
  const navigate = useNavigate()

  const handleSignOut = async () => {
    await signOut()
    navigate('/connexion', { replace: true })
  }

  const noCredits = (profile?.credits ?? 0) === 0

  return (
    <div className="min-h-full">
      {/*
        Deux dispositions. À partir de 640px : tout sur une ligne.
        En dessous : la navigation passe sur une seconde ligne défilante,
        car quatre libellés + le solde + la déconnexion ne tiennent pas
        sur 390px. Le badge de crédits, lui, reste TOUJOURS visible :
        c'est l'information que le membre vient chercher en premier.
      */}
      <header className="sticky top-0 z-30 border-b border-line bg-sand/85 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="flex h-16 items-center gap-4 sm:gap-6">
            <Logo />

            <nav className="hidden items-center gap-1 sm:flex">
              <NavItem to="/" end>Tableau de bord</NavItem>
              <NavItem to="/salles">Salles</NavItem>
              <NavItem to="/credits">Crédits</NavItem>
              {isAdmin && <NavItem to="/gestion">Gestion</NavItem>}
            </nav>

            <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
              {profile && (
                <NavLink to="/credits">
                  <Badge tone={noCredits ? 'amber' : 'leaf'} className="px-2.5 py-1.5 sm:px-3">
                    <svg viewBox="0 0 16 16" className="size-3.5" fill="currentColor" aria-hidden>
                      <circle cx="8" cy="8" r="6.5" fillOpacity="0.25" />
                      <circle cx="8" cy="8" r="3" />
                    </svg>
                    <span className="hidden sm:inline">{formatCredits(profile.credits)}</span>
                    <span className="sm:hidden">{profile.credits}</span>
                  </Badge>
                </NavLink>
              )}

              <div className="hidden text-right leading-tight md:block">
                <p className="text-sm font-medium">{profile?.name}</p>
                <p className="text-xs text-ink-faint">
                  {isAdmin ? 'Gérant' : SUBSCRIPTION_LABEL[profile?.subscription_type ?? 'NOMAD']}
                </p>
              </div>

              <Button variant="ghost" onClick={handleSignOut} className="px-2">
                <svg viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
                  <path d="M12.5 6.5V5a1.5 1.5 0 0 0-1.5-1.5H5A1.5 1.5 0 0 0 3.5 5v10A1.5 1.5 0 0 0 5 16.5h6a1.5 1.5 0 0 0 1.5-1.5v-1.5M8 10h8.5m0 0-2.5-2.5M16.5 10 14 12.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="sr-only">Se déconnecter</span>
              </Button>
            </div>
          </div>

          <nav className="-mx-4 flex items-center gap-1 overflow-x-auto px-4 pb-2 sm:hidden">
            <NavItem to="/" end>Tableau de bord</NavItem>
            <NavItem to="/salles">Salles</NavItem>
            <NavItem to="/credits">Crédits</NavItem>
            {isAdmin && <NavItem to="/gestion">Gestion</NavItem>}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <Outlet />
      </main>
    </div>
  )
}
