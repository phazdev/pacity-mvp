-- Pacity MVP — 01 : extensions + tables de reference
create extension if not exists btree_gist with schema extensions;

set local search_path = public, extensions;

-- ---------------------------------------------------------------
-- profiles : miroir applicatif de auth.users
-- credits est un CACHE maintenu par trigger depuis credit_transactions
-- ---------------------------------------------------------------
create table public.profiles (
  id                uuid primary key references auth.users(id) on delete cascade,
  name              text not null,
  email             text not null unique,
  role              text not null default 'client'
                    check (role in ('client','admin')),
  subscription_type text not null default 'NOMAD'
                    check (subscription_type in ('NOMAD','FULL_TIME')),
  credits           integer not null default 0 check (credits >= 0),
  created_at        timestamptz not null default now()
);

comment on column public.profiles.credits is
  'Cache du solde. Source de verite = SUM(credit_transactions.amount). Maintenu par trigger, ne jamais ecrire directement.';
comment on column public.profiles.subscription_type is
  'Determine la dotation mensuelle uniquement (FULL_TIME=20/mois, NOMAD=0). Le droit de reserver depend du solde, pas de ce champ.';

-- ---------------------------------------------------------------
-- rooms
-- ---------------------------------------------------------------
create table public.rooms (
  id            uuid primary key default gen_random_uuid(),
  name          text not null unique,
  capacity      integer not null check (capacity > 0),
  type_label    text not null,
  cost_per_hour integer not null check (cost_per_hour > 0),
  is_available  boolean not null default true,
  archived_at   timestamptz,
  created_at    timestamptz not null default now()
);

comment on column public.rooms.is_available is
  'Mise hors service longue duree. Pour une fermeture ponctuelle datee, utiliser room_closures.';
comment on column public.rooms.archived_at is
  'Suppression logique. Les salles ne sont jamais supprimees physiquement (integrite de l historique).';

-- ---------------------------------------------------------------
-- options : catalogue, cout FIXE par reservation (pas horaire)
-- ---------------------------------------------------------------
create table public.options (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  description text,
  credit_cost integer not null check (credit_cost >= 0),
  created_at  timestamptz not null default now()
);

comment on column public.options.credit_cost is
  'Cout fixe unique par reservation, independant de la duree.';

-- ---------------------------------------------------------------
-- room_options : quelles options sont proposees dans quelle salle
-- ---------------------------------------------------------------
create table public.room_options (
  room_id   uuid not null references public.rooms(id)   on delete cascade,
  option_id uuid not null references public.options(id) on delete cascade,
  primary key (room_id, option_id)
);

create index on public.room_options (option_id);
