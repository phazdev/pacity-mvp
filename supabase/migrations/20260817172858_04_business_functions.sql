-- Pacity MVP — 04 : RPC metier. Toute mutation passe par ici.

-- ---------------------------------------------------------------
-- get_room_schedule : occupation d une salle, ANONYMISEE pour un client.
-- C est ce qui permet d afficher "Occupe" sans exposer qui occupe.
-- ---------------------------------------------------------------
create or replace function public.get_room_schedule(
  p_room_id uuid,
  p_from    timestamptz,
  p_to      timestamptz
)
returns table (
  kind          text,
  start_time    timestamptz,
  end_time      timestamptz,
  booking_id    uuid,
  is_mine       boolean,
  label         text,
  total_cost    integer
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    'booking'::text,
    b.start_time,
    b.end_time,
    case when b.user_id = auth.uid() or public.is_admin() then b.id end,
    b.user_id = auth.uid(),
    case
      when b.user_id = auth.uid() then 'Ma réservation'
      when public.is_admin()      then p.name
      else 'Occupé'
    end,
    case when b.user_id = auth.uid() or public.is_admin() then b.total_cost end
  from public.bookings b
  join public.profiles p on p.id = b.user_id
  where b.room_id = p_room_id
    and b.status = 'confirmed'
    and b.start_time < p_to
    and b.end_time   > p_from
    and auth.uid() is not null

  union all

  select 'closure'::text, c.start_time, c.end_time, null, false, c.reason, null
  from public.room_closures c
  where c.room_id = p_room_id
    and c.start_time < p_to
    and c.end_time   > p_from
    and auth.uid() is not null;
$$;

-- ---------------------------------------------------------------
-- create_booking : reservation atomique.
-- Valide, debite et enregistre en une seule transaction.
-- ---------------------------------------------------------------
create or replace function public.create_booking(
  p_room_id    uuid,
  p_start      timestamptz,
  p_end        timestamptz,
  p_option_ids uuid[] default '{}'::uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_user         uuid := auth.uid();
  v_room         public.rooms%rowtype;
  v_hours        integer;
  v_room_cost    integer;
  v_options_cost integer := 0;
  v_total        integer;
  v_credits      integer;
  v_booking_id   uuid;
begin
  if v_user is null then
    raise exception 'Authentification requise.';
  end if;

  perform public.assert_bookable_slot(p_start, p_end);

  if p_start < now() then
    raise exception 'Impossible de reserver un creneau passe.';
  end if;
  if p_start > now() + interval '30 days' then
    raise exception 'Les reservations sont ouvertes 30 jours a l avance au maximum.';
  end if;

  select * into v_room from public.rooms where id = p_room_id;
  if not found then
    raise exception 'Salle introuvable.';
  end if;
  if v_room.archived_at is not null then
    raise exception 'Cette salle n est plus proposee.';
  end if;
  if not v_room.is_available then
    raise exception 'La salle % est hors service.', v_room.name;
  end if;

  if exists (
    select 1 from public.room_closures c
    where c.room_id = p_room_id
      and tstzrange(c.start_time, c.end_time) && tstzrange(p_start, p_end)
  ) then
    raise exception 'La salle est fermee sur ce creneau.';
  end if;

  v_hours     := (extract(epoch from (p_end - p_start)) / 3600)::integer;
  v_room_cost := v_hours * v_room.cost_per_hour;

  -- Une option doit etre proposee dans CETTE salle
  if coalesce(array_length(p_option_ids, 1), 0) > 0 then
    if exists (
      select 1 from unnest(p_option_ids) as oid
      where not exists (
        select 1 from public.room_options ro
        where ro.room_id = p_room_id and ro.option_id = oid
      )
    ) then
      raise exception 'Une des options demandees n est pas disponible dans cette salle.';
    end if;

    select coalesce(sum(o.credit_cost), 0) into v_options_cost
    from public.options o where o.id = any(p_option_ids);
  end if;

  v_total := v_room_cost + v_options_cost;

  -- Verrou sur le profil : deux reservations simultanees ne peuvent pas
  -- consommer le meme solde.
  select credits into v_credits from public.profiles where id = v_user for update;
  if v_credits < v_total then
    raise exception 'Solde insuffisant : % credit(s) necessaires, % disponible(s).',
      v_total, v_credits;
  end if;

  begin
    insert into public.bookings (
      user_id, room_id, start_time, end_time,
      hours_count, room_cost, options_cost, total_cost
    )
    values (
      v_user, p_room_id, p_start, p_end,
      v_hours, v_room_cost, v_options_cost, v_total
    )
    returning id into v_booking_id;
  exception when exclusion_violation then
    raise exception 'Ce creneau vient d etre reserve par quelqu un d autre.';
  end;

  insert into public.booking_options (booking_id, option_id, unit_cost)
  select v_booking_id, o.id, o.credit_cost
  from public.options o where o.id = any(p_option_ids);

  insert into public.credit_transactions (user_id, amount, type, description, booking_id)
  values (
    v_user, -v_total, 'BOOKING_PAYMENT',
    format('%s — %s', v_room.name,
      to_char(p_start at time zone 'Europe/Paris', 'DD/MM/YYYY à HH24hMI')),
    v_booking_id
  );

  return v_booking_id;
end;
$$;

-- ---------------------------------------------------------------
-- cancel_booking : gerant uniquement, remboursement systematique.
-- ---------------------------------------------------------------
create or replace function public.cancel_booking(
  p_booking_id uuid,
  p_reason     text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin uuid := auth.uid();
  v_b     public.bookings%rowtype;
begin
  if not public.is_admin(v_admin) then
    raise exception 'Seul le gerant peut annuler une reservation.';
  end if;

  select * into v_b from public.bookings where id = p_booking_id for update;
  if not found then
    raise exception 'Reservation introuvable.';
  end if;
  if v_b.status = 'cancelled' then
    raise exception 'Cette reservation est deja annulee.';
  end if;

  update public.bookings
     set status = 'cancelled',
         cancelled_at = now(),
         cancelled_by = v_admin,
         cancellation_reason = p_reason
   where id = p_booking_id;

  if v_b.total_cost > 0 then
    insert into public.credit_transactions (user_id, amount, type, description, booking_id)
    values (
      v_b.user_id, v_b.total_cost, 'BOOKING_REFUND',
      coalesce(nullif(p_reason, ''), 'Annulation par le gerant'),
      p_booking_id
    );
  end if;
end;
$$;

-- ---------------------------------------------------------------
-- close_room : fermeture datee. Annule et rembourse l existant.
-- ---------------------------------------------------------------
create or replace function public.close_room(
  p_room_id uuid,
  p_start   timestamptz,
  p_end     timestamptz,
  p_reason  text
)
returns integer
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_admin uuid := auth.uid();
  v_id    uuid;
  v_count integer := 0;
begin
  if not public.is_admin(v_admin) then
    raise exception 'Seul le gerant peut fermer une salle.';
  end if;
  if p_end <= p_start then
    raise exception 'La fin de fermeture doit etre posterieure au debut.';
  end if;

  for v_id in
    select b.id from public.bookings b
    where b.room_id = p_room_id
      and b.status = 'confirmed'
      and tstzrange(b.start_time, b.end_time) && tstzrange(p_start, p_end)
  loop
    perform public.cancel_booking(v_id, format('Salle fermee — %s', p_reason));
    v_count := v_count + 1;
  end loop;

  insert into public.room_closures (room_id, start_time, end_time, reason, created_by)
  values (p_room_id, p_start, p_end, p_reason, v_admin);

  return v_count;
end;
$$;

-- ---------------------------------------------------------------
-- create_order : commande en statut 'pending'.
-- ---------------------------------------------------------------
create or replace function public.create_order(
  p_kind    text,
  p_pack_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_pack public.credit_packs%rowtype;
  v_plan public.subscription_plans%rowtype;
  v_id   uuid;
begin
  if v_user is null then
    raise exception 'Authentification requise.';
  end if;

  if p_kind = 'CREDIT_PACK' then
    select * into v_pack from public.credit_packs
     where id = p_pack_id and is_active;
    if not found then
      raise exception 'Pack introuvable ou inactif.';
    end if;

    insert into public.orders (user_id, kind, pack_id, label, credits_granted, amount_cents)
    values (v_user, 'CREDIT_PACK', v_pack.id, v_pack.name, v_pack.credits, v_pack.price_cents)
    returning id into v_id;

  elsif p_kind = 'SUBSCRIPTION' then
    if (select subscription_type from public.profiles where id = v_user) = 'FULL_TIME' then
      raise exception 'Vous etes deja abonne Full Time.';
    end if;

    select * into v_plan from public.subscription_plans where code = 'FULL_TIME';

    insert into public.orders (user_id, kind, pack_id, label, credits_granted, amount_cents)
    values (v_user, 'SUBSCRIPTION', null, v_plan.name, v_plan.monthly_credits, v_plan.price_cents)
    returning id into v_id;

  else
    raise exception 'Type de commande inconnu : %', p_kind;
  end if;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------
-- fulfill_order : POINT D ENTREE UNIQUE DU PAIEMENT.
-- Appele aujourd hui par le bouton "Valider le paiement".
-- Demain par un webhook Stripe : rien d autre a changer.
-- Idempotent : rejouer l appel ne credite jamais deux fois.
-- ---------------------------------------------------------------
create or replace function public.fulfill_order(
  p_order_id     uuid,
  p_provider_ref text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_o    public.orders%rowtype;
  v_type text;
begin
  select * into v_o from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Commande introuvable.';
  end if;

  -- auth.uid() est NULL quand l appel vient d un webhook en service_role.
  if auth.uid() is not null
     and v_o.user_id <> auth.uid()
     and not public.is_admin() then
    raise exception 'Cette commande ne vous appartient pas.';
  end if;

  if v_o.status = 'paid' then
    return v_o.id;                       -- idempotence
  end if;
  if v_o.status <> 'pending' then
    raise exception 'Commande deja % : paiement impossible.', v_o.status;
  end if;

  update public.orders
     set status = 'paid',
         paid_at = now(),
         provider_ref = coalesce(p_provider_ref, provider_ref)
   where id = p_order_id;

  if v_o.kind = 'SUBSCRIPTION' then
    update public.profiles set subscription_type = 'FULL_TIME' where id = v_o.user_id;
    -- Premiere dotation du mois. create_order interdit de s abonner deux fois,
    -- donc pas de collision avec l index d unicite mensuel.
    v_type := 'MONTHLY_SUBSCRIPTION';
  else
    v_type := 'TOP_UP';
  end if;

  if v_o.credits_granted > 0 then
    insert into public.credit_transactions (user_id, amount, type, description, order_id)
    values (v_o.user_id, v_o.credits_granted, v_type, v_o.label, v_o.id);
  end if;

  return v_o.id;
end;
$$;

-- ---------------------------------------------------------------
-- run_monthly_renewal : dotation mensuelle. Idempotent par index.
-- Appele par pg_cron, ou manuellement par le gerant.
-- ---------------------------------------------------------------
create or replace function public.run_monthly_renewal()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_credits integer;
  v_count   integer;
begin
  -- auth.uid() est NULL quand l appel vient de pg_cron.
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'Reserve au gerant.';
  end if;

  select monthly_credits into v_credits
  from public.subscription_plans where code = 'FULL_TIME';

  with inserted as (
    insert into public.credit_transactions (user_id, amount, type, description)
    select p.id, v_credits, 'MONTHLY_SUBSCRIPTION',
           format('Dotation mensuelle Full Time — %s',
             to_char(now() at time zone 'Europe/Paris', 'MM/YYYY'))
    from public.profiles p
    where p.subscription_type = 'FULL_TIME'
    on conflict do nothing
    returning 1
  )
  select count(*) into v_count from inserted;

  return v_count;
end;
$$;

-- ---------------------------------------------------------------
-- admin_adjust_credits : geste commercial / correction manuelle.
-- ---------------------------------------------------------------
create or replace function public.admin_adjust_credits(
  p_user_id     uuid,
  p_amount      integer,
  p_description text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'Reserve au gerant.';
  end if;
  if p_amount = 0 then
    raise exception 'Le montant doit etre non nul.';
  end if;

  insert into public.credit_transactions (user_id, amount, type, description)
  values (p_user_id, p_amount, 'ADMIN_ADJUSTMENT',
          coalesce(nullif(p_description, ''), 'Ajustement par le gerant'));
end;
$$;
