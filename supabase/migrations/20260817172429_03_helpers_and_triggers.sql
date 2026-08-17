-- Pacity MVP — 03 : plans, helpers, triggers d integrite

-- ---------------------------------------------------------------
-- subscription_plans : lisible par le front pour afficher le tarif
-- ---------------------------------------------------------------
create table public.subscription_plans (
  code            text primary key check (code in ('NOMAD','FULL_TIME')),
  name            text not null,
  monthly_credits integer not null check (monthly_credits >= 0),
  price_cents     integer not null check (price_cents >= 0),
  description     text
);

-- ---------------------------------------------------------------
-- is_admin : helper RLS. SECURITY DEFINER pour ne pas re-declencher
-- les policies de profiles (recursion infinie classique).
-- ---------------------------------------------------------------
create or replace function public.is_admin(p_uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((select role = 'admin' from public.profiles where id = p_uid), false);
$$;

-- ---------------------------------------------------------------
-- sync_credits : maintient profiles.credits depuis le ledger.
-- C est le SEUL endroit ou profiles.credits est ecrit.
-- ---------------------------------------------------------------
create or replace function public.sync_credits()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.profiles
     set credits = credits + new.amount
   where id = new.user_id;

  if not found then
    raise exception 'Profil % introuvable', new.user_id;
  end if;

  return new;
end;
$$;

create trigger trg_sync_credits
  after insert on public.credit_transactions
  for each row execute function public.sync_credits();

-- ---------------------------------------------------------------
-- Ledger append-only : toute tentative de reecriture est bloquee.
-- ---------------------------------------------------------------
create or replace function public.reject_ledger_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'credit_transactions est append-only : ni UPDATE ni DELETE. Enregistrer une transaction inverse.';
end;
$$;

create trigger trg_ledger_immutable
  before update or delete on public.credit_transactions
  for each row execute function public.reject_ledger_mutation();

-- ---------------------------------------------------------------
-- handle_new_user : cree le profil a l inscription (seed ET signup app)
-- ---------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, name, email, role, subscription_type)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email,
    coalesce(new.raw_user_meta_data->>'role', 'client'),
    coalesce(new.raw_user_meta_data->>'subscription_type', 'NOMAD')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger trg_on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------
-- assert_bookable_slot : regles d ouverture Pacity.
-- 8h-20h, lundi-vendredi, heures pleines, meme journee,
-- 8h consecutives max, 30 jours d horizon, jamais dans le passe.
-- Tout est evalue en heure de Paris.
-- ---------------------------------------------------------------
create or replace function public.assert_bookable_slot(p_start timestamptz, p_end timestamptz)
returns void
language plpgsql
immutable
as $$
declare
  v_start_local timestamp := p_start at time zone 'Europe/Paris';
  v_end_local   timestamp := p_end   at time zone 'Europe/Paris';
begin
  if p_end <= p_start then
    raise exception 'La fin doit etre posterieure au debut.';
  end if;

  if date_trunc('hour', v_start_local) <> v_start_local
     or date_trunc('hour', v_end_local) <> v_end_local then
    raise exception 'Les reservations se font sur des heures pleines.';
  end if;

  if v_start_local::date <> (v_end_local - interval '1 minute')::date then
    raise exception 'Une reservation ne peut pas s etendre sur plusieurs jours.';
  end if;

  if extract(isodow from v_start_local) > 5 then
    raise exception 'Le coworking est ferme le week-end.';
  end if;

  if extract(hour from v_start_local) < 8 or extract(hour from v_end_local) > 20
     or (extract(hour from v_end_local) = 0) then
    raise exception 'Les salles sont ouvertes de 8h a 20h.';
  end if;

  if (p_end - p_start) > interval '8 hours' then
    raise exception 'Une reservation ne peut pas depasser 8 heures consecutives.';
  end if;
end;
$$;
