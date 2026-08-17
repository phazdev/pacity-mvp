-- Pacity MVP — 02 : reservations, commerce, ledger
set local search_path = public, extensions;

-- ---------------------------------------------------------------
-- credit_packs : catalogue d achat
-- ---------------------------------------------------------------
create table public.credit_packs (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  credits     integer not null check (credits > 0),
  price_cents integer not null check (price_cents > 0),
  is_active   boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------
-- orders : commandes. provider='simulated' aujourd hui, 'stripe' demain.
-- ---------------------------------------------------------------
create table public.orders (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete restrict,
  kind            text not null check (kind in ('CREDIT_PACK','SUBSCRIPTION')),
  pack_id         uuid references public.credit_packs(id) on delete restrict,
  label           text not null,
  credits_granted integer not null check (credits_granted >= 0),
  amount_cents    integer not null check (amount_cents >= 0),
  status          text not null default 'pending'
                  check (status in ('pending','paid','cancelled','failed')),
  provider        text not null default 'simulated',
  provider_ref    text,
  created_at      timestamptz not null default now(),
  paid_at         timestamptz,
  constraint orders_pack_required check (kind <> 'CREDIT_PACK' or pack_id is not null),
  constraint orders_paid_coherent check (status <> 'paid' or paid_at is not null)
);

comment on table public.orders is
  'Frontiere du paiement. Le passage a Stripe consiste a renseigner provider/provider_ref et a laisser le webhook appeler fulfill_order().';

create index on public.orders (user_id, created_at desc);
create index on public.orders (pack_id);

-- ---------------------------------------------------------------
-- bookings : anti-chevauchement garanti par contrainte EXCLUDE
-- ---------------------------------------------------------------
create table public.bookings (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.profiles(id) on delete restrict,
  room_id             uuid not null references public.rooms(id)    on delete restrict,
  start_time          timestamptz not null,
  end_time            timestamptz not null,
  hours_count         integer not null check (hours_count > 0),
  room_cost           integer not null check (room_cost >= 0),
  options_cost        integer not null default 0 check (options_cost >= 0),
  total_cost          integer not null check (total_cost >= 0),
  status              text not null default 'confirmed'
                      check (status in ('confirmed','cancelled')),
  cancelled_at        timestamptz,
  cancelled_by        uuid references public.profiles(id) on delete set null,
  cancellation_reason text,
  created_at          timestamptz not null default now(),

  constraint bookings_time_order     check (end_time > start_time),
  constraint bookings_total_coherent check (total_cost = room_cost + options_cost),
  constraint bookings_cancel_coherent check (
    (status = 'cancelled' and cancelled_at is not null)
    or (status = 'confirmed' and cancelled_at is null)
  ),

  -- Le coeur du systeme : impossible de reserver deux fois le meme
  -- creneau sur la meme salle. Atomique, pas de race condition.
  constraint bookings_no_overlap exclude using gist (
    room_id with =,
    tstzrange(start_time, end_time) with &&
  ) where (status = 'confirmed')
);

create index on public.bookings (user_id, start_time desc);
create index on public.bookings (room_id, start_time);
create index on public.bookings (cancelled_by);

-- ---------------------------------------------------------------
-- booking_options : unit_cost fige le prix au moment de la reservation
-- ---------------------------------------------------------------
create table public.booking_options (
  booking_id uuid not null references public.bookings(id) on delete cascade,
  option_id  uuid not null references public.options(id)  on delete restrict,
  unit_cost  integer not null check (unit_cost >= 0),
  primary key (booking_id, option_id)
);

create index on public.booking_options (option_id);

-- ---------------------------------------------------------------
-- room_closures : fermetures administratives datees et motivees
-- ---------------------------------------------------------------
create table public.room_closures (
  id         uuid primary key default gen_random_uuid(),
  room_id    uuid not null references public.rooms(id) on delete cascade,
  start_time timestamptz not null,
  end_time   timestamptz not null,
  reason     text not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),

  constraint closures_time_order check (end_time > start_time),
  constraint closures_no_overlap exclude using gist (
    room_id with =,
    tstzrange(start_time, end_time) with &&
  )
);

create index on public.room_closures (room_id, start_time);
create index on public.room_closures (created_by);

-- ---------------------------------------------------------------
-- credit_transactions : ledger immuable, SOURCE DE VERITE des soldes
-- ---------------------------------------------------------------
create table public.credit_transactions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete restrict,
  amount      integer not null check (amount <> 0),
  type        text not null check (type in (
                'MONTHLY_SUBSCRIPTION','TOP_UP',
                'BOOKING_PAYMENT','BOOKING_REFUND','ADMIN_ADJUSTMENT')),
  description text,
  booking_id  uuid references public.bookings(id) on delete restrict,
  order_id    uuid references public.orders(id)   on delete restrict,
  created_at  timestamptz not null default now()
);

comment on table public.credit_transactions is
  'Ledger append-only. profiles.credits en est derive par trigger. Ne jamais UPDATE ni DELETE.';

create index on public.credit_transactions (user_id, created_at desc);
create index on public.credit_transactions (booking_id);

-- Un paiement ne peut jamais crediter deux fois, meme si le webhook est rejoue.
create unique index credit_tx_one_per_order
  on public.credit_transactions (order_id)
  where order_id is not null;

-- Un booking ne peut etre paye qu une fois, et rembourse qu une fois.
create unique index credit_tx_one_per_booking_type
  on public.credit_transactions (booking_id, type)
  where booking_id is not null;

-- Idempotence du renouvellement mensuel : une seule dotation par membre et par mois.
-- 'at time zone' avec zone constante est IMMUTABLE, donc indexable.
create unique index credit_tx_one_subscription_per_month
  on public.credit_transactions (
    user_id,
    (date_trunc('month', (created_at at time zone 'Europe/Paris')))
  )
  where type = 'MONTHLY_SUBSCRIPTION';
