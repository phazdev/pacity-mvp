-- Pacity MVP — 08 : correctifs issus du linter Supabase

-- ---------------------------------------------------------------
-- 1. search_path fige sur les deux fonctions qui en manquaient
-- ---------------------------------------------------------------
alter function public.reject_ledger_mutation() set search_path = public, pg_temp;
alter function public.assert_bookable_slot(timestamptz, timestamptz) set search_path = public, pg_temp;

-- ---------------------------------------------------------------
-- 2. auth.uid() / is_admin() enveloppes dans un SELECT.
-- Sans cela, Postgres les reevalue POUR CHAQUE LIGNE au lieu d une
-- fois par requete : sur l historique du ledger, l ecart se voit.
-- ---------------------------------------------------------------
drop policy "profiles_select_self_or_admin" on public.profiles;
create policy "profiles_select_self_or_admin"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));

drop policy "bookings_select_own_or_admin" on public.bookings;
create policy "bookings_select_own_or_admin"
  on public.bookings for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

drop policy "booking_options_select_own_or_admin" on public.booking_options;
create policy "booking_options_select_own_or_admin"
  on public.booking_options for select to authenticated
  using (exists (
    select 1 from public.bookings b
    where b.id = booking_id
      and (b.user_id = (select auth.uid()) or (select public.is_admin()))
  ));

drop policy "credit_transactions_select_own_or_admin" on public.credit_transactions;
create policy "credit_transactions_select_own_or_admin"
  on public.credit_transactions for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

drop policy "orders_select_own_or_admin" on public.orders;
create policy "orders_select_own_or_admin"
  on public.orders for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

-- ---------------------------------------------------------------
-- 3. room_options : la policy FOR ALL recouvrait le SELECT, ce qui
-- faisait evaluer deux policies a chaque lecture. On separe.
-- ---------------------------------------------------------------
drop policy "room_options_admin_write" on public.room_options;

create policy "room_options_admin_insert" on public.room_options
  for insert to authenticated with check ((select public.is_admin()));
create policy "room_options_admin_update" on public.room_options
  for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "room_options_admin_delete" on public.room_options
  for delete to authenticated using ((select public.is_admin()));

-- Meme optimisation sur les policies d administration du parc
drop policy "rooms_admin_insert" on public.rooms;
drop policy "rooms_admin_update" on public.rooms;
create policy "rooms_admin_insert" on public.rooms
  for insert to authenticated with check ((select public.is_admin()));
create policy "rooms_admin_update" on public.rooms
  for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy "options_admin_insert" on public.options;
drop policy "options_admin_update" on public.options;
create policy "options_admin_insert" on public.options
  for insert to authenticated with check ((select public.is_admin()));
create policy "options_admin_update" on public.options
  for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
