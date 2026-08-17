-- Pacity MVP — 13 : lever une fermeture
--
-- close_room() pose une fermeture et rembourse les reservations
-- impactees. Il manquait le geste inverse : sans lui, une erreur de
-- saisie du gerant bloquait la salle definitivement.
--
-- Les reservations deja annulees ne sont PAS retablies : elles ont ete
-- remboursees, le ledger est immuable, et le creneau a pu etre repris
-- entre-temps. Les membres doivent re-reserver.

create or replace function public.delete_closure(p_closure_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'Seul le gerant peut lever une fermeture.';
  end if;

  delete from public.room_closures where id = p_closure_id;

  if not found then
    raise exception 'Fermeture introuvable.';
  end if;
end;
$$;

revoke execute on function public.delete_closure(uuid) from public, anon;
grant  execute on function public.delete_closure(uuid) to authenticated;
