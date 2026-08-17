-- Pacity MVP — 11 : remplace le broadcast des migrations 09/10
--
-- POURQUOI CE CHANGEMENT
-- La migration 09 diffusait via realtime.send(), qui ecrit dans
-- realtime.messages. Cette table est partitionnee par jour et n avait
-- aucune partition. Impossible d en creer : le role `postgres` n a pas
-- le droit CREATE sur le schema `realtime` (proprietaire supabase_admin).
-- realtime.send() avale son exception -> les messages disparaissaient
-- silencieusement. La migration 10 tentait de creer ces partitions et
-- ne pouvait pas fonctionner.
--
-- SOLUTION : une table temoin dans `public`, que l on maitrise totalement.
-- Elle ne contient QUE room_id + horodatage : aucune donnee personnelle,
-- donc elle peut etre lisible par tous les membres connectes sans rien
-- divulguer. Le client la surveille et, au moindre changement, recharge
-- get_room_schedule() qui reapplique l anonymisation.

-- --- Demontage de l approche precedente -------------------------
drop trigger if exists trg_broadcast_booking_change on public.bookings;
drop trigger if exists trg_broadcast_closure_change on public.room_closures;
drop function if exists public.broadcast_schedule_change();
drop policy  if exists "pacity_room_topics_readable" on realtime.messages;

select cron.unschedule('pacity-realtime-partitions')
where exists (select 1 from cron.job where jobname = 'pacity-realtime-partitions');

drop function if exists public.ensure_realtime_partitions(integer);

-- --- Table temoin ------------------------------------------------
create table public.room_schedule_events (
  room_id    uuid primary key references public.rooms(id) on delete cascade,
  changed_at timestamptz not null default now(),
  revision   bigint      not null default 1
);

comment on table public.room_schedule_events is
  'Signal de changement d agenda, une ligne par salle. Ne contient aucune donnee personnelle : c est ce qui permet de la rendre lisible par tous sans fuite. Le client recharge get_room_schedule() a chaque revision.';

-- Une ligne par salle des le depart : les clients n ont donc a ecouter
-- que des UPDATE.
insert into public.room_schedule_events (room_id)
select id from public.rooms;

alter table public.room_schedule_events enable row level security;

create policy "room_schedule_events_select_authenticated"
  on public.room_schedule_events for select to authenticated using (true);
-- Aucune policy d ecriture : seul le trigger (SECURITY DEFINER) ecrit.

-- --- Le trigger --------------------------------------------------
create or replace function public.bump_room_schedule()
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

  insert into public.room_schedule_events (room_id)
  values (v_room)
  on conflict (room_id) do update
    set changed_at = now(),
        revision   = public.room_schedule_events.revision + 1;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke execute on function public.bump_room_schedule() from public, anon, authenticated;

create trigger trg_bump_schedule_on_booking
  after insert or update or delete on public.bookings
  for each row execute function public.bump_room_schedule();

create trigger trg_bump_schedule_on_closure
  after insert or update or delete on public.room_closures
  for each row execute function public.bump_room_schedule();

-- Une nouvelle salle doit avoir sa ligne temoin
create or replace function public.init_room_schedule_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.room_schedule_events (room_id)
  values (new.id) on conflict (room_id) do nothing;
  return new;
end;
$$;

revoke execute on function public.init_room_schedule_event() from public, anon, authenticated;

create trigger trg_init_schedule_event
  after insert on public.rooms
  for each row execute function public.init_room_schedule_event();

-- --- Diffusion Realtime ------------------------------------------
alter publication supabase_realtime add table public.room_schedule_events;
