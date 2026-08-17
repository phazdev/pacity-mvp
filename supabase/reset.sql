-- ============================================================
-- Pacity — RESET TOTAL (destructif)
-- ============================================================
-- Supprime TOUT : tables, fonctions, comptes de demonstration,
-- job cron. A n utiliser que pour repartir d une base vierge.
--
-- Apres execution, rejouer dans l ordre les fichiers de
-- supabase/migrations/ (01 -> 11).
--
-- Pour simplement remettre la demo a plat SANS tout detruire,
-- utiliser supabase/reseed.sql a la place.
-- ============================================================

-- Jobs planifies
select cron.unschedule('pacity-monthly-renewal')
where exists (select 1 from cron.job where jobname = 'pacity-monthly-renewal');
select cron.unschedule('pacity-realtime-partitions')
where exists (select 1 from cron.job where jobname = 'pacity-realtime-partitions');

-- Trigger pose sur le schema auth (hors du schema public)
drop trigger if exists trg_on_auth_user_created on auth.users;

-- Vestige eventuel de la migration 09 (annulee par la 11)
drop policy if exists "pacity_room_topics_readable" on realtime.messages;

-- Tables applicatives (CASCADE emporte policies, index, contraintes,
-- triggers et les FK vers profiles)
drop table if exists public.room_schedule_events cascade;
drop table if exists public.booking_options     cascade;
drop table if exists public.credit_transactions cascade;
drop table if exists public.bookings            cascade;
drop table if exists public.room_closures       cascade;
drop table if exists public.orders              cascade;
drop table if exists public.credit_packs        cascade;
drop table if exists public.room_options        cascade;
drop table if exists public.options             cascade;
drop table if exists public.rooms               cascade;
drop table if exists public.subscription_plans  cascade;
drop table if exists public.profiles            cascade;

-- Fonctions
drop function if exists public.create_booking(uuid, timestamptz, timestamptz, uuid[]);
drop function if exists public.cancel_booking(uuid, text);
drop function if exists public.close_room(uuid, timestamptz, timestamptz, text);
drop function if exists public.create_order(text, uuid);
drop function if exists public.fulfill_order(uuid, text);
drop function if exists public.run_monthly_renewal();
drop function if exists public.admin_adjust_credits(uuid, integer, text);
drop function if exists public.get_room_schedule(uuid, timestamptz, timestamptz);
drop function if exists public.assert_bookable_slot(timestamptz, timestamptz);
drop function if exists public.is_admin(uuid);
drop function if exists public.sync_credits();
drop function if exists public.reject_ledger_mutation();
drop function if exists public.handle_new_user();
drop function if exists public.bump_room_schedule();
drop function if exists public.init_room_schedule_event();
drop function if exists public.broadcast_schedule_change();
drop function if exists public.ensure_realtime_partitions(integer);

-- Comptes de demonstration
delete from auth.users
where email in ('mathieu@pacity.fr','pierre@pacity.fr','sophie@pacity.fr','claire@pacity.fr');
