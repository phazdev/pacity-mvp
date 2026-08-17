-- ============================================================
-- Pacity — REMISE A ZERO DE LA DEMO
-- ============================================================
-- Purge les donnees transactionnelles (reservations, ledger,
-- commandes, fermetures) et rejoue le seed d origine.
--
-- CONSERVE : comptes Auth, profils, salles, options, packs, plans.
--
-- A lancer avant une demo, ou apres avoir fait n importe quoi en test.
-- Les reservations sont recalees sur la semaine en cours a chaque
-- execution : la grille n est donc jamais vide.
--
-- Usage : coller dans le SQL Editor Supabase, ou
--   psql "$DATABASE_URL" -f supabase/reseed.sql
-- ============================================================

begin;

-- --- Purge ---------------------------------------------------
-- Le trigger d immuabilite du ledger doit etre desactive le temps
-- de la purge : c est le SEUL cas legitime de suppression.
alter table public.credit_transactions disable trigger trg_ledger_immutable;

delete from public.booking_options;
delete from public.credit_transactions;
delete from public.bookings;
delete from public.orders;
delete from public.room_closures;

alter table public.credit_transactions enable trigger trg_ledger_immutable;

update public.profiles set credits = 0;

-- Les comptes ayant pu changer d abonnement en demo reviennent a l origine
update public.profiles set subscription_type = 'NOMAD'     where email = 'sophie@pacity.fr';
update public.profiles set subscription_type = 'FULL_TIME'
  where email in ('pierre@pacity.fr','claire@pacity.fr','mathieu@pacity.fr');

-- --- Dotations mensuelles ------------------------------------
insert into public.credit_transactions (user_id, amount, type, description)
select p.id, 20, 'MONTHLY_SUBSCRIPTION',
       format('Dotation mensuelle Full Time — %s',
         to_char(now() at time zone 'Europe/Paris', 'MM/YYYY'))
from public.profiles p
where p.subscription_type = 'FULL_TIME';

-- --- Achat de pack deja realise par Claire -------------------
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

-- --- Reservations de demonstration ---------------------------
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

-- --- Fermeture administrative --------------------------------
insert into public.room_closures (room_id, start_time, end_time, reason, created_by)
select r.id,
  (date_trunc('week', (now() at time zone 'Europe/Paris')) at time zone 'Europe/Paris') + interval '2 days 14 hours',
  (date_trunc('week', (now() at time zone 'Europe/Paris')) at time zone 'Europe/Paris') + interval '2 days 18 hours',
  'Travaux — reprise de la climatisation',
  '22222222-2222-2222-2222-222222222222'
from public.rooms r where r.name = 'Medium Room';

commit;

-- --- Controle : le cache doit egaler le ledger ---------------
select p.name, p.subscription_type as abo, p.credits,
       coalesce(sum(t.amount), 0) as ledger,
       p.credits = coalesce(sum(t.amount), 0) as coherent
from public.profiles p
left join public.credit_transactions t on t.user_id = p.id
group by p.id, p.name, p.subscription_type, p.credits
order by p.name;
