-- Pacity MVP — 06 : jeu de donnees de demonstration
-- Mot de passe commun a tous les comptes : Pacity2026!
--
-- Pour REJOUER uniquement la partie transactionnelle (soldes, reservations,
-- fermetures) sans toucher aux comptes ni au catalogue : voir supabase/reseed.sql

-- ---------------------------------------------------------------
-- Comptes Auth. Le trigger trg_on_auth_user_created cree les profils.
-- ---------------------------------------------------------------
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
values
  ('00000000-0000-0000-0000-000000000000',
   '22222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated',
   'mathieu@pacity.fr', extensions.crypt('Pacity2026!', extensions.gen_salt('bf')),
   now(), now(), now(),
   '{"provider":"email","providers":["email"]}',
   '{"name":"Mathieu Ferrand","role":"admin","subscription_type":"FULL_TIME"}',
   '', '', '', ''),

  ('00000000-0000-0000-0000-000000000000',
   '11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated',
   'pierre@pacity.fr', extensions.crypt('Pacity2026!', extensions.gen_salt('bf')),
   now(), now(), now(),
   '{"provider":"email","providers":["email"]}',
   '{"name":"Pierre Hazebaert","role":"client","subscription_type":"FULL_TIME"}',
   '', '', '', ''),

  ('00000000-0000-0000-0000-000000000000',
   '33333333-3333-3333-3333-333333333333', 'authenticated', 'authenticated',
   'sophie@pacity.fr', extensions.crypt('Pacity2026!', extensions.gen_salt('bf')),
   now(), now(), now(),
   '{"provider":"email","providers":["email"]}',
   '{"name":"Sophie Meunier","role":"client","subscription_type":"NOMAD"}',
   '', '', '', ''),

  ('00000000-0000-0000-0000-000000000000',
   '44444444-4444-4444-4444-444444444444', 'authenticated', 'authenticated',
   'claire@pacity.fr', extensions.crypt('Pacity2026!', extensions.gen_salt('bf')),
   now(), now(), now(),
   '{"provider":"email","providers":["email"]}',
   '{"name":"Claire Dubois","role":"client","subscription_type":"FULL_TIME"}',
   '', '', '', '');

insert into auth.identities (
  id, user_id, provider_id, identity_data, provider,
  last_sign_in_at, created_at, updated_at
)
select
  gen_random_uuid(), u.id, u.id::text,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
  'email', now(), now(), now()
from auth.users u
where u.email in ('mathieu@pacity.fr','pierre@pacity.fr','sophie@pacity.fr','claire@pacity.fr');

-- ---------------------------------------------------------------
-- Abonnements et packs
-- ---------------------------------------------------------------
insert into public.subscription_plans (code, name, monthly_credits, price_cents, description) values
  ('NOMAD',     'Nomad',     0,  0,    'Acces aux espaces partages. Aucun credit de reservation inclus.'),
  ('FULL_TIME', 'Full Time', 20, 3900, '20 credits par mois, cumulables. Le meilleur tarif au credit.');

insert into public.credit_packs (name, credits, price_cents, sort_order) values
  ('Pack Decouverte', 5,  1500, 1),
  ('Pack Regulier',   10, 2500, 2),
  ('Pack Intensif',   20, 4500, 3);

-- ---------------------------------------------------------------
-- Salles et options
-- ---------------------------------------------------------------
insert into public.rooms (name, capacity, type_label, cost_per_hour) values
  ('Phone Booth',  1,  'Appels',     1),
  ('Small Room',   4,  'Reunion',    2),
  ('Medium Room',  8,  'Reunion',    3),
  ('Large Room',   16, 'Conference', 5);

insert into public.options (name, description, credit_cost) values
  ('Videoprojecteur',    'Videoprojecteur Full HD avec cable HDMI et adaptateurs.', 2),
  ('Panier de fruits',   'Panier de saison pour l ensemble des participants.',      2),
  ('Paperboard digital', 'Ecran tactile avec export des notes par email.',          1);

insert into public.room_options (room_id, option_id)
select r.id, o.id
from public.rooms r
cross join public.options o
where (r.name = 'Small Room' and o.name in ('Panier de fruits','Paperboard digital'))
   or (r.name in ('Medium Room','Large Room'));

-- ---------------------------------------------------------------
-- Dotations mensuelles initiales (tous les Full Time)
-- ---------------------------------------------------------------
insert into public.credit_transactions (user_id, amount, type, description)
select p.id, 20, 'MONTHLY_SUBSCRIPTION',
       format('Dotation mensuelle Full Time — %s',
         to_char(now() at time zone 'Europe/Paris', 'MM/YYYY'))
from public.profiles p
where p.subscription_type = 'FULL_TIME';

-- ---------------------------------------------------------------
-- Claire a deja achete un pack : on passe par le vrai tunnel de
-- commande, ce qui valide fulfill_order() des le seed.
-- ---------------------------------------------------------------
do $$
declare v_order uuid;
begin
  insert into public.orders (user_id, kind, pack_id, label, credits_granted, amount_cents)
  select p.id, 'CREDIT_PACK', cp.id, cp.name, cp.credits, cp.price_cents
  from public.profiles p, public.credit_packs cp
  where p.email = 'claire@pacity.fr' and cp.name = 'Pack Regulier'
  returning id into v_order;

  perform public.fulfill_order(v_order, 'seed-demo');
end $$;

-- ---------------------------------------------------------------
-- Reservations de demonstration.
-- Positionnees relativement au lundi de la semaine en cours, pour que
-- la grille ne soit jamais vide quelle que soit la date d execution.
-- Les offsets 7 et 8 tombent la semaine suivante : il y a donc
-- toujours des creneaux a venir, meme un vendredi soir.
-- ---------------------------------------------------------------
do $$
declare
  v_monday timestamptz := (date_trunc('week', (now() at time zone 'Europe/Paris')))
                            at time zone 'Europe/Paris';
  v_seed      record;
  v_room      public.rooms%rowtype;
  v_user      uuid;
  v_start     timestamptz;
  v_room_cost integer;
  v_opt_cost  integer;
  v_bid       uuid;
begin
  for v_seed in
    select * from (values
      -- email,            salle,         jour(0=lundi), debut, duree, options
      ('claire@pacity.fr', 'Medium Room', 1, 9,  2, array['Videoprojecteur']),
      ('pierre@pacity.fr', 'Medium Room', 1, 14, 2, array[]::text[]),
      ('claire@pacity.fr', 'Large Room',  2, 10, 2, array['Panier de fruits']),
      ('pierre@pacity.fr', 'Phone Booth', 3, 10, 1, array[]::text[]),
      ('claire@pacity.fr', 'Small Room',  7, 9,  2, array['Paperboard digital']),
      ('pierre@pacity.fr', 'Medium Room', 8, 14, 3, array[]::text[])
    ) as t(email, room_name, day_offset, start_hour, hours, opts)
  loop
    select id into v_user from public.profiles where email = v_seed.email;
    select * into v_room from public.rooms where name = v_seed.room_name;

    v_start := v_monday + (v_seed.day_offset || ' days')::interval
                        + (v_seed.start_hour || ' hours')::interval;
    v_room_cost := v_seed.hours * v_room.cost_per_hour;

    select coalesce(sum(credit_cost), 0) into v_opt_cost
    from public.options where name = any(v_seed.opts);

    insert into public.bookings (user_id, room_id, start_time, end_time,
                                 hours_count, room_cost, options_cost, total_cost)
    values (v_user, v_room.id, v_start, v_start + (v_seed.hours || ' hours')::interval,
            v_seed.hours, v_room_cost, v_opt_cost, v_room_cost + v_opt_cost)
    returning id into v_bid;

    insert into public.booking_options (booking_id, option_id, unit_cost)
    select v_bid, o.id, o.credit_cost from public.options o where o.name = any(v_seed.opts);

    insert into public.credit_transactions (user_id, amount, type, description, booking_id)
    values (v_user, -(v_room_cost + v_opt_cost), 'BOOKING_PAYMENT',
            format('%s — %s', v_room.name,
              to_char(v_start at time zone 'Europe/Paris', 'DD/MM/YYYY à HH24hMI')),
            v_bid);
  end loop;
end $$;

-- ---------------------------------------------------------------
-- Une fermeture datee, pour illustrer le hachurage sur la grille
-- ---------------------------------------------------------------
insert into public.room_closures (room_id, start_time, end_time, reason, created_by)
select r.id,
  (date_trunc('week', (now() at time zone 'Europe/Paris')) at time zone 'Europe/Paris') + interval '2 days 14 hours',
  (date_trunc('week', (now() at time zone 'Europe/Paris')) at time zone 'Europe/Paris') + interval '2 days 18 hours',
  'Travaux — reprise de la climatisation',
  '22222222-2222-2222-2222-222222222222'
from public.rooms r where r.name = 'Medium Room';
