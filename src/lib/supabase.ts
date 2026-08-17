import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!url || !key) {
  throw new Error(
    'Configuration Supabase manquante. Copiez .env.example en .env.local puis relancez `npm run dev`.',
  )
}

export const supabase = createClient(url, key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
})

/**
 * Les RPC remontent des messages métier rédigés en français
 * (« Solde insuffisant : 6 crédit(s) nécessaires… »). On les affiche tels
 * quels : c'est volontaire, ils sont écrits pour l'utilisateur final.
 * Le reste est traduit pour ne jamais exposer de jargon Postgres.
 */
export function errorMessage(error: unknown): string {
  if (!error) return 'Une erreur est survenue.'

  const raw =
    typeof error === 'string'
      ? error
      : ((error as { message?: string }).message ?? String(error))

  const map: Record<string, string> = {
    'Invalid login credentials': 'Email ou mot de passe incorrect.',
    'Email not confirmed': "Ce compte n'a pas encore été confirmé.",
    'User already registered': 'Un compte existe déjà avec cet email.',
    'Password should be at least 6 characters':
      'Le mot de passe doit contenir au moins 6 caractères.',
    'Failed to fetch': 'Connexion au serveur impossible. Vérifiez votre réseau.',
  }
  if (map[raw]) return map[raw]

  for (const [needle, translated] of Object.entries(map)) {
    if (raw.includes(needle)) return translated
  }
  return raw
}
