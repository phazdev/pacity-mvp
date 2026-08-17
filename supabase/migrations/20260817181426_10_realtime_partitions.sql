-- Pacity MVP — 10 : partitions de realtime.messages
--
-- ⚠️ MIGRATION MORTE — ANNULEE PAR LA 11. Conservee pour l historique.
--
-- Elle ne pouvait pas fonctionner : le role `postgres` n a pas le
-- privilege CREATE sur le schema `realtime` (proprietaire supabase_admin,
-- table appartenant a supabase_realtime_admin). Le CREATE TABLE echouait,
-- l exception etait avalee par le bloc de rattrapage, et la fonction
-- renvoyait 0 sans rien signaler.
--
-- Diagnostic :
--   select has_schema_privilege('postgres','realtime','CREATE');  --> false
--
-- Lecon : ne jamais mettre `exception when others then null` autour d un
-- DDL. C est ce qui a masque la cause pendant deux iterations.

create or replace function public.ensure_realtime_partitions(p_days integer default 14)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  d         date;
  v_name    text;
  v_created integer := 0;
begin
  for d in
    select generate_series(current_date - 1, current_date + p_days, interval '1 day')::date
  loop
    v_name := format('messages_%s', to_char(d, 'YYYY_MM_DD'));

    if to_regclass('realtime.' || quote_ident(v_name)) is null then
      begin
        execute format(
          'create table realtime.%I partition of realtime.messages '
          'for values from (%L) to (%L)',
          v_name, d::timestamp, (d + 1)::timestamp
        );
        v_created := v_created + 1;
      exception when others then
        null;
      end;
    end if;
  end loop;

  return v_created;
end;
$$;

revoke execute on function public.ensure_realtime_partitions(integer) from public, anon, authenticated;

select public.ensure_realtime_partitions(14);

select cron.schedule(
  'pacity-realtime-partitions',
  '0 3 * * *',
  $$select public.ensure_realtime_partitions(14)$$
);
