import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react'
import type { ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Profile } from '@/lib/types'

interface AuthValue {
  session: Session | null
  profile: Profile | null
  loading: boolean
  isAdmin: boolean
  refreshProfile: () => Promise<void>
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string, name: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  // Évite une course : si la session change pendant un fetch de profil,
  // la réponse obsolète ne doit pas écraser la nouvelle.
  const userIdRef = useRef<string | null>(null)

  const loadProfile = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle()

    if (error) {
      console.error('Chargement du profil impossible', error)
      return
    }
    if (userIdRef.current === userId) setProfile(data as Profile | null)
  }, [])

  const refreshProfile = useCallback(async () => {
    if (userIdRef.current) await loadProfile(userIdRef.current)
  }, [loadProfile])

  useEffect(() => {
    let active = true

    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return
      setSession(data.session)
      userIdRef.current = data.session?.user.id ?? null
      if (data.session) await loadProfile(data.session.user.id)
      setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      userIdRef.current = next?.user.id ?? null
      if (next) {
        void loadProfile(next.user.id)
      } else {
        setProfile(null)
      }
    })

    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [loadProfile])

  /**
   * Le solde doit bouger tout seul : quand le gérant annule une
   * réservation, le remboursement arrive par le ledger et profiles.credits
   * est mis à jour par trigger. On écoute donc notre propre ligne.
   * La RLS garantit qu'on ne reçoit que la sienne.
   */
  useEffect(() => {
    const userId = session?.user.id
    if (!userId) return

    const channel = supabase
      .channel(`profile-${userId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` },
        (payload) => setProfile(payload.new as Profile),
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [session?.user.id])

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }, [])

  const signUp = useCallback(async (email: string, password: string, name: string) => {
    // `name` transite par les métadonnées : le trigger handle_new_user
    // les lit pour créer le profil. Un nouveau compte est toujours
    // NOMAD à 0 crédit — il devra acheter avant de pouvoir réserver.
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name, role: 'client', subscription_type: 'NOMAD' } },
    })
    if (error) throw error
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setProfile(null)
  }, [])

  const value = useMemo<AuthValue>(
    () => ({
      session,
      profile,
      loading,
      isAdmin: profile?.role === 'admin',
      refreshProfile,
      signIn,
      signUp,
      signOut,
    }),
    [session, profile, loading, refreshProfile, signIn, signUp, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth doit être utilisé dans un <AuthProvider>')
  return ctx
}
