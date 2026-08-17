-- Pacity MVP — 05 : RLS.
-- Principe : lecture filtree par policy, ECRITURE DIRECTE INTERDITE partout.
-- Toute mutation passe par les RPC SECURITY DEFINER de la migration 04.
--
-- NOTE : les policies de lecture sont reecrites en migration 08 avec
-- (select auth.uid()) pour eviter la reevaluation ligne a ligne.

alter table public.profiles            enable row level security;
alter table public.rooms               enable row level security;
alter table public.options             enable row level security;
alter table public.room_options        enable row level security;
alter table public.bookings            enable row level security;
alter table public.booking_options     enable row level security;
alter table public.room_closures       enable row level security;
alter table public.credit_transactions enable row level security;
alter table public.credit_packs        enable row level security;
alter table public.orders              enable row level security;
alter table public.subscription_plans  enable row level security;

-- --- Profils : le sien, ou tous pour le gerant -------------------
create policy "profiles_select_self_or_admin"
  on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());

-- --- Catalogue : lisible par tout membre connecte ----------------
create policy "rooms_select_authenticated"
  on public.rooms for select to authenticated using (true);

create policy "options_select_authenticated"
  on public.options for select to authenticated using (true);

create policy "room_options_select_authenticated"
  on public.room_options for select to authenticated using (true);

create policy "credit_packs_select_authenticated"
  on public.credit_packs for select to authenticated using (true);

create policy "subscription_plans_select_authenticated"
  on public.subscription_plans for select to authenticated using (true);

-- Les fermetures sont visibles de tous : la grille doit afficher
-- le motif ("Travaux") sur les creneaux concernes.
create policy "room_closures_select_authenticated"
  on public.room_closures for select to authenticated using (true);

-- --- Gestion du parc : reserve au gerant -------------------------
create policy "rooms_admin_insert" on public.rooms
  for insert to authenticated with check (public.is_admin());
create policy "rooms_admin_update" on public.rooms
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "options_admin_insert" on public.options
  for insert to authenticated with check (public.is_admin());
create policy "options_admin_update" on public.options
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "room_options_admin_write" on public.room_options
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- --- Donnees personnelles : les siennes, ou tout pour le gerant ---
create policy "bookings_select_own_or_admin"
  on public.bookings for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy "booking_options_select_own_or_admin"
  on public.booking_options for select to authenticated
  using (exists (
    select 1 from public.bookings b
    where b.id = booking_id and (b.user_id = auth.uid() or public.is_admin())
  ));

create policy "credit_transactions_select_own_or_admin"
  on public.credit_transactions for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy "orders_select_own_or_admin"
  on public.orders for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------
-- Exposition des RPC : rien pour anon.
-- ---------------------------------------------------------------
revoke execute on function public.create_booking(uuid, timestamptz, timestamptz, uuid[])   from public, anon;
revoke execute on function public.cancel_booking(uuid, text)                               from public, anon;
revoke execute on function public.close_room(uuid, timestamptz, timestamptz, text)         from public, anon;
revoke execute on function public.create_order(text, uuid)                                 from public, anon;
revoke execute on function public.fulfill_order(uuid, text)                                from public, anon;
revoke execute on function public.run_monthly_renewal()                                    from public, anon;
revoke execute on function public.admin_adjust_credits(uuid, integer, text)                from public, anon;
revoke execute on function public.get_room_schedule(uuid, timestamptz, timestamptz)        from public, anon;
revoke execute on function public.is_admin(uuid)                                           from public, anon;

grant execute on function public.create_booking(uuid, timestamptz, timestamptz, uuid[])    to authenticated;
grant execute on function public.cancel_booking(uuid, text)                                to authenticated;
grant execute on function public.close_room(uuid, timestamptz, timestamptz, text)          to authenticated;
grant execute on function public.create_order(text, uuid)                                  to authenticated;
grant execute on function public.fulfill_order(uuid, text)                                 to authenticated;
grant execute on function public.run_monthly_renewal()                                     to authenticated;
grant execute on function public.admin_adjust_credits(uuid, integer, text)                 to authenticated;
grant execute on function public.get_room_schedule(uuid, timestamptz, timestamptz)         to authenticated;
grant execute on function public.is_admin(uuid)                                            to authenticated;

-- Fonctions internes : jamais appelables depuis l API.
revoke execute on function public.sync_credits()            from public, anon, authenticated;
revoke execute on function public.reject_ledger_mutation()  from public, anon, authenticated;
revoke execute on function public.handle_new_user()         from public, anon, authenticated;
revoke execute on function public.assert_bookable_slot(timestamptz, timestamptz) from public, anon;
