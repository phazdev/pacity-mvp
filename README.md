# Pacity — MVP de réservation de salles

Application interne de réservation de salles de réunion pour le coworking Pacity.
Cas d'étude client : Mathieu, fondateur.

**État actuel : base de données terminée et vérifiée. Frontend à construire.**
Suivi détaillé dans [`docs/PLAN.md`](docs/PLAN.md).

---

## En ligne

**https://pacity-mvp.vercel.app**

Projet Vercel `pacity-mvp`, team PHAZDEV. Redéployer après modification :

```bash
npm run build && npx vercel deploy --prod --yes
```

Les variables `VITE_SUPABASE_URL` et `VITE_SUPABASE_PUBLISHABLE_KEY` sont
configurées côté Vercel (`npx vercel env ls production`). Le fichier
`vercel.json` réécrit toutes les routes vers `index.html` — sans lui, une URL
directe comme `/salles` renverrait un 404, React Router gérant les routes
côté client.

## Comptes de démonstration

Mot de passe commun : **`Pacity2026!`**

| Email | Rôle | Abonnement | Solde | Sert à démontrer |
| :--- | :--- | :--- | ---: | :--- |
| `mathieu@pacity.fr` | Gérant | Full Time | 20 | Dashboard admin, annulations, fermetures |
| `pierre@pacity.fr` | Client | Full Time | 4 | Parcours de réservation classique |
| `sophie@pacity.fr` | Client | Nomad | 0 | Blocage à 0 crédit, puis tunnel d'achat |
| `claire@pacity.fr` | Client | Full Time | 5 | Occupe des créneaux → affichage « Occupé » anonyme |

---

## Projet Supabase

| | |
| :--- | :--- |
| Référence | `vujzhlylcwpnqpidjfyd` |
| URL | `https://vujzhlylcwpnqpidjfyd.supabase.co` |
| Région | eu-west-1 |

La clé publiable est dans `.env.local` (voir `.env.example`). Elle est publique par
conception — c'est la RLS qui protège les données, pas le secret de la clé.

---

## Structure

```
supabase/
  migrations/        DDL appliqué, dans l'ordre 01 → 08
  reseed.sql         Remet la démo à plat (non destructif)
  reset.sql          Détruit tout pour repartir de zéro (destructif)
docs/
  PLAN.md            Feuille de route et état d'avancement
  ARCHITECTURE.md    Schéma, invariants, référence des RPC
brief.md             Brief client d'origine
complement.md        Complément d'architecture d'origine
```

---

## Opérations courantes

**Remettre la démo à plat** (avant une soutenance, ou après avoir cassé des données
en test) — conserve les comptes et le catalogue, recale les réservations sur la
semaine en cours :

```sql
-- Coller supabase/reseed.sql dans le SQL Editor Supabase
```

**Repartir d'une base totalement vierge** : exécuter `supabase/reset.sql`, puis
rejouer `supabase/migrations/` dans l'ordre.

**Vérifier l'intégrité des soldes** — doit renvoyer `coherent = true` partout :

```sql
select p.name, p.credits, coalesce(sum(t.amount), 0) as ledger,
       p.credits = coalesce(sum(t.amount), 0) as coherent
from public.profiles p
left join public.credit_transactions t on t.user_id = p.id
group by p.id, p.name, p.credits;
```

---

## Réglage restant côté tableau de bord Supabase

La protection contre les mots de passe compromis (HaveIBeenPwned) est désactivée.
C'est un réglage projet, non modifiable en SQL :
**Authentication → Policies → Leaked password protection**. Sans effet sur la démo,
mais à activer avant toute mise en production.
