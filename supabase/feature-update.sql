
-- =========================================================
-- DAENITRYXX FEATURE UPDATE
-- 1. Driver availability: available / busy / offline / unavailable
-- 2. Stripe payment provider
-- 3. Authenticated tracking returns full contact/address details
-- =========================================================

-- DRIVER AVAILABILITY
alter table public.drivers
  drop constraint if exists drivers_availability_check;

alter table public.drivers
  add constraint drivers_availability_check
  check (availability in ('available','busy','offline','unavailable'));

create or replace function public.driver_set_availability(
  p_availability text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_driver() then
    raise exception 'Driver access required';
  end if;

  if p_availability not in ('available','busy','offline','unavailable') then
    raise exception 'Invalid driver availability';
  end if;

  update public.drivers
  set
    availability = p_availability,
    updated_at = now()
  where
    user_id = auth.uid()
    and verification_status = 'approved';

  if not found then
    raise exception 'Approved driver record not found';
  end if;
end;
$$;

revoke all on function public.driver_set_availability(text) from public;
grant execute on function public.driver_set_availability(text) to authenticated;

-- Allow administrators to use the same four statuses.
create or replace function public.admin_set_driver_availability(
  p_driver_id uuid,
  p_availability text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  if p_availability not in ('available','busy','offline','unavailable') then
    raise exception 'Invalid availability';
  end if;

  update public.drivers
  set
    availability = p_availability,
    updated_at = now()
  where
    user_id = p_driver_id
    and verification_status = 'approved';

  if not found then
    raise exception 'Approved driver not found';
  end if;
end;
$$;

revoke all on function public.admin_set_driver_availability(uuid,text) from public;
grant execute on function public.admin_set_driver_availability(uuid,text) to authenticated;


-- PAYMENT PROVIDER: add Stripe without changing existing payment records.
alter table public.payments
  drop constraint if exists payments_provider_check;

alter table public.payments
  add constraint payments_provider_check
  check (provider in ('paystack','flutterwave','stripe','other'));


-- AUTHENTICATED TRACKING: include full pickup/receiver names,
-- phones and addresses. Public tracking remains limited.
drop function if exists public.get_my_tracking(text);

create or replace function public.get_my_tracking(p_tracking_number text)
returns table(
  tracking_number text,
  status text,
  pickup_name text,
  pickup_phone text,
  pickup_address text,
  pickup_city text,
  delivery_name text,
  delivery_phone text,
  delivery_address text,
  delivery_city text,
  package_description text,
  package_weight_kg numeric,
  delivery_fee numeric,
  updated_at timestamptz,
  history jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  sid uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select s.id
  into sid
  from public.shipments s
  where
    s.tracking_number = upper(trim(p_tracking_number))
    and (
      s.customer_id = auth.uid()
      or s.driver_id = auth.uid()
      or public.is_admin()
    )
  limit 1;

  if sid is null then
    return;
  end if;

  return query
  select
    s.tracking_number,
    s.status::text,
    s.pickup_name,
    s.pickup_phone,
    s.pickup_address,
    s.pickup_city,
    s.delivery_name,
    s.delivery_phone,
    s.delivery_address,
    s.delivery_city,
    s.package_description,
    s.package_weight_kg,
    s.delivery_fee,
    s.updated_at,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'status', h.status::text,
            'note', h.note,
            'created_at', h.created_at
          )
          order by h.created_at
        )
        from public.shipment_status_history h
        where h.shipment_id = s.id
      ),
      '[]'::jsonb
    )
  from public.shipments s
  where s.id = sid;
end;
$$;

revoke all on function public.get_my_tracking(text) from public;
grant execute on function public.get_my_tracking(text) to authenticated;
