-- Pacity MVP — 09 : Realtime
--
-- ⚠️ PARTIELLEMENT ANNULEE PAR LA MIGRATION 11.
-- Ce qui reste actif : la publication des tables profiles et
-- credit_transactions (partie A ci-dessous).
-- Ce qui a ete retire : tout le mecanisme de broadcast (partie B).
-- Raison detaillee en tete de la migration 11.
--
-- Deux mecanismes complementaires, parce que Realtime applique la RLS :
--
--  A. postgres_changes sur les donnees PERSONNELLES (profil, ledger).
--     La RLS joue en notre faveur : chacun ne recoit que ses propres
--     evenements. C est ce qui fait remonter le solde en direct quand
--     le gerant annule une reservation.
--
--  B. Broadcast pour l AGENDA DES SALLES. Un client ne peut pas lire les
--     reservations des autres, donc postgres_changes ne lui livrerait
--     jamais l evenement "Claire a reserve mardi 14h".

-- ---------------------------------------------------------------
-- A. Donnees personnelles — TOUJOURS ACTIF
-- ---------------------------------------------------------------
alter publication supabase_realtime add table public.profiles;
alter publication supabase_realtime add table public.credit_transactions;

-- ---------------------------------------------------------------
-- B. Signal d invalidation par salle — REMPLACE PAR LA MIGRATION 11
-- ---------------------------------------------------------------
create or replace function public.broadcast_schedule_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_room uuid;
begin
  if tg_op = 'DELETE' then
    v_room := old.room_id;
  else
    v_room := new.room_id;
  end if;

  perform realtime.send(
    jsonb_build_object('room_id', v_room, 'op', tg_op),
    'schedule_changed',
    'room:' || v_room::text,
    true
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger trg_broadcast_booking_change
  after insert or update or delete on public.bookings
  for each row execute function public.broadcast_schedule_change();

create trigger trg_broadcast_closure_change
  after insert or update or delete on public.room_closures
  for each row execute function public.broadcast_schedule_change();

revoke execute on function public.broadcast_schedule_change() from public, anon, authenticated;

create policy "pacity_room_topics_readable"
  on realtime.messages for select to authenticated
  using (realtime.topic() like 'room:%');
