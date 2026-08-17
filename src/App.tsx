import { Navigate, Route, Routes } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { AppLayout } from '@/components/AppLayout'
import { Loading } from '@/components/ui'

import { AuthPage } from '@/pages/AuthPage'
import { Dashboard } from '@/pages/Dashboard'
import { Rooms } from '@/pages/Rooms'
import { RoomBooking } from '@/pages/RoomBooking'
import { Credits } from '@/pages/Credits'
import { Checkout } from '@/pages/Checkout'
import { Management } from '@/pages/admin/Management'

function FullPageLoader() {
  return (
    <div className="grid min-h-full place-items-center">
      <Loading label="Chargement de votre espace…" />
    </div>
  )
}

/** Redirige vers la connexion si la session est absente. */
function Protected({ children }: { children: ReactNode }) {
  const { session, profile, loading } = useAuth()
  if (loading) return <FullPageLoader />
  if (!session) return <Navigate to="/connexion" replace />
  // La session existe mais le profil n'est pas encore arrivé : on attend
  // plutôt que d'afficher une interface aux données manquantes.
  if (!profile) return <FullPageLoader />
  return <>{children}</>
}

function AdminOnly({ children }: { children: ReactNode }) {
  const { isAdmin } = useAuth()
  if (!isAdmin) return <Navigate to="/" replace />
  return <>{children}</>
}

export function App() {
  const { session, loading } = useAuth()

  return (
    <Routes>
      <Route
        path="/connexion"
        element={
          loading ? <FullPageLoader /> : session ? <Navigate to="/" replace /> : <AuthPage />
        }
      />

      <Route
        element={
          <Protected>
            <AppLayout />
          </Protected>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="salles" element={<Rooms />} />
        <Route path="salles/:roomId" element={<RoomBooking />} />
        <Route path="credits" element={<Credits />} />
        <Route path="credits/paiement/:orderId" element={<Checkout />} />
        <Route path="gestion" element={<AdminOnly><Management /></AdminOnly>} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
