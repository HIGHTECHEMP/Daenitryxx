-- DAENITRYXX production schema / migration
-- This file is safe to run on the existing DAENITRYXX database.
-- It creates missing functions, fixes RLS, and makes driver approval/assignment workflows atomic.

create extension if not exists pgcrypto;

-- -------------------------
-- Helpers
-- -------------------------
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.profiles where id=auth.uid() and role='admin');
$$;
create or replace function public.is_driver() returns boolean
language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.profiles where id=auth.uid() and role='driver');
$$;
create or replace function public.current_role() returns public.user_role
language sql stable security definer set search_path=public as $$
  select role from public.profiles where id=auth.uid();
$$;

-- -------------------------
-- Auth user trigger
-- -------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  account_type text;
  full_name_value text;
  phone_value text;
  vehicle_value text;
  license_value text;
  notes_value text;
begin
  full_name_value := coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'),''), split_part(coalesce(new.email,''),'@',1));
  if char_length(full_name_value) < 2 then full_name_value := 'DAENITRYXX User'; end if;
  phone_value := nullif(trim(new.raw_user_meta_data->>'phone'),'');
  account_type := coalesce(new.raw_user_meta_data->>'account_type','customer');

  insert into public.profiles(id,full_name,phone)
  values(new.id,full_name_value,phone_value)
  on conflict(id) do update set full_name=excluded.full_name,phone=excluded.phone;

  if account_type='driver' then
    vehicle_value := nullif(trim(new.raw_user_meta_data->>'vehicle_type'),'');
    license_value := nullif(trim(new.raw_user_meta_data->>'license_reference'),'');
    notes_value := nullif(trim(new.raw_user_meta_data->>'notes'),'');

    -- Driver applications are created only when required fields are valid.
    if phone_value is not null and char_length(phone_value)>=3
       and vehicle_value is not null and char_length(vehicle_value)>=2
       and license_value is not null and char_length(license_value)>=2 then
      insert into public.driver_applications(user_id,full_name,phone,vehicle_type,license_reference,notes,status)
      values(new.id,full_name_value,phone_value,vehicle_value,license_value,notes_value,'pending');
    end if;
  end if;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

-- -------------------------
-- Driver application review
-- -------------------------
create or replace function public.review_driver_application(
  p_application_id uuid,
  p_decision public.application_status,
  p_reason text default null
) returns void language plpgsql security definer set search_path=public as $$
declare applicant uuid; vehicle text; app_status public.application_status;
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  select user_id,vehicle_type,status into applicant,vehicle,app_status
  from public.driver_applications where id=p_application_id for update;
  if applicant is null then raise exception 'Application not found'; end if;
  if app_status <> 'pending' then raise exception 'Application has already been reviewed'; end if;

  update public.driver_applications
  set status=p_decision,reviewed_by=auth.uid(),reviewed_at=now(),review_reason=nullif(trim(coalesce(p_reason,'')),'')
  where id=p_application_id;

  if p_decision='approved' then
    update public.profiles set role='driver',updated_at=now() where id=applicant;
    insert into public.drivers(user_id,vehicle_type,verification_status,availability)
    values(applicant,vehicle,'approved','available')
    on conflict(user_id) do update set vehicle_type=excluded.vehicle_type,verification_status='approved',availability='available',updated_at=now();
    insert into public.notifications(user_id,title,body)
    values(applicant,'Driver application approved','Your DAENITRYXX driver application has been approved. You can now access your driver dashboard.');
  else
    insert into public.notifications(user_id,title,body)
    values(applicant,'Driver application update','Your DAENITRYXX driver application was not approved at this time.');
  end if;

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,details)
  values(auth.uid(),'driver_application_reviewed','driver_application',p_application_id,jsonb_build_object('decision',p_decision));
end $$;

create or replace function public.repair_approved_driver(p_application_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare applicant uuid; vehicle text; app_status public.application_status;
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  select user_id,vehicle_type,status into applicant,vehicle,app_status from public.driver_applications where id=p_application_id;
  if applicant is null then raise exception 'Application not found'; end if;
  if app_status <> 'approved' then raise exception 'Application is not approved'; end if;
  update public.profiles set role='driver',updated_at=now() where id=applicant;
  insert into public.drivers(user_id,vehicle_type,verification_status,availability)
  values(applicant,vehicle,'approved','available')
  on conflict(user_id) do update set vehicle_type=excluded.vehicle_type,verification_status='approved',updated_at=now();
end $$;

-- -------------------------
-- Driver assignment response
-- -------------------------
create or replace function public.driver_respond_assignment(
  p_assignment_id uuid,
  p_decision public.assignment_status,
  p_reason text default null
) returns void language plpgsql security definer set search_path=public as $$
declare sid uuid; current_status public.assignment_status; customer uuid;
begin
  if not public.is_driver() then raise exception 'Driver access required'; end if;
  if p_decision not in ('accepted','rejected') then raise exception 'Invalid assignment decision'; end if;
  select da.shipment_id,da.status,s.customer_id into sid,current_status,customer
  from public.delivery_assignments da join public.shipments s on s.id=da.shipment_id
  where da.id=p_assignment_id and da.driver_id=auth.uid() for update;
  if sid is null then raise exception 'Assignment not found'; end if;
  if current_status <> 'offered' then raise exception 'Assignment is no longer awaiting a response'; end if;

  if p_decision='accepted' then
    update public.delivery_assignments set status='accepted',accepted_at=now() where id=p_assignment_id;
    update public.shipments set status='confirmed',updated_at=now() where id=sid and status='driver_assigned';
    insert into public.shipment_status_history(shipment_id,status,changed_by,note) values(sid,'confirmed',auth.uid(),'Driver accepted assignment');
    insert into public.notifications(user_id,title,body) values(customer,'Driver accepted','Your delivery assignment has been accepted by the assigned driver.');
  else
    update public.delivery_assignments set status='rejected',rejected_at=now() where id=p_assignment_id;
    update public.shipments set driver_id=null,status='confirmed',updated_at=now() where id=sid;
    insert into public.shipment_status_history(shipment_id,status,changed_by,note) values(sid,'confirmed',auth.uid(),coalesce(nullif(trim(p_reason),''),'Driver rejected assignment'));
    insert into public.notifications(user_id,title,body) values(customer,'Driver assignment declined','Your shipment is awaiting another driver assignment.');
  end if;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,details)
  values(auth.uid(),'driver_assignment_response','delivery_assignment',p_assignment_id,jsonb_build_object('decision',p_decision,'reason',p_reason));
end $$;

-- -------------------------
-- Driver delivery status
-- -------------------------
create or replace function public.driver_update_delivery_status(
  p_assignment_id uuid,
  p_status public.shipment_status,
  p_note text default null
) returns void language plpgsql security definer set search_path=public as $$
declare sid uuid; assigned uuid; old_status public.shipment_status; customer uuid;
begin
  if not public.is_driver() then raise exception 'Driver access required'; end if;
  select shipment_id,driver_id into sid,assigned from public.delivery_assignments where id=p_assignment_id for update;
  if sid is null or assigned<>auth.uid() then raise exception 'Not authorized'; end if;
  select status,customer_id into old_status,customer from public.shipments where id=sid for update;
  if p_status not in ('picked_up','in_transit','out_for_delivery','delivered','failed_delivery') then raise exception 'Invalid driver status'; end if;
  if old_status in ('delivered','cancelled','failed_delivery') then raise exception 'Shipment is already closed'; end if;

  update public.shipments set status=p_status,delivered_at=case when p_status='delivered' then now() else delivered_at end where id=sid;
  update public.delivery_assignments set status=case when p_status='delivered' then 'completed' else 'accepted' end,accepted_at=coalesce(accepted_at,now()),completed_at=case when p_status='delivered' then now() else completed_at end where id=p_assignment_id;
  insert into public.shipment_status_history(shipment_id,status,changed_by,note) values(sid,p_status,auth.uid(),p_note);
  insert into public.notifications(user_id,title,body) values(customer,'Shipment update','Your shipment status is now '||replace(p_status::text,'_',' '));

  if p_status='delivered' then
    insert into public.driver_earnings(driver_id,shipment_id,amount,status)
    select auth.uid(),sid,greatest(s.delivery_fee,0),'approved' from public.shipments s where s.id=sid
    on conflict do nothing;
  end if;
end $$;

-- -------------------------
-- Admin shipment management
-- -------------------------
create or replace function public.admin_update_shipment(
  p_shipment_id uuid,
  p_status public.shipment_status,
  p_delivery_fee numeric,
  p_driver_id uuid default null
) returns void language plpgsql security definer set search_path=public as $$
declare old_driver uuid; old_status public.shipment_status;
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  if p_delivery_fee is null or p_delivery_fee < 0 then raise exception 'Invalid delivery fee'; end if;
  select driver_id,status into old_driver,old_status from public.shipments where id=p_shipment_id for update;
  if old_status is null then raise exception 'Shipment not found'; end if;

  if p_driver_id is not null and not exists(select 1 from public.drivers where user_id=p_driver_id and verification_status='approved') then
    raise exception 'Driver is not approved';
  end if;

  update public.shipments set status=p_status,delivery_fee=p_delivery_fee,driver_id=p_driver_id,
    delivered_at=case when p_status='delivered' then coalesce(delivered_at,now()) else delivered_at end where id=p_shipment_id;

  if p_driver_id is not null then
    insert into public.delivery_assignments(shipment_id,driver_id,status,assigned_at)
    values(p_shipment_id,p_driver_id,'offered',now())
    on conflict(shipment_id) do update set driver_id=excluded.driver_id,status='offered',assigned_at=now(),accepted_at=null,rejected_at=null,completed_at=null;
    insert into public.notifications(user_id,title,body) values(p_driver_id,'New delivery assignment','You have been assigned a shipment. Please review and accept it.');
  else
    delete from public.delivery_assignments where shipment_id=p_shipment_id;
  end if;

  if old_status is distinct from p_status then
    insert into public.shipment_status_history(shipment_id,status,changed_by,note) values(p_shipment_id,p_status,auth.uid(),'Admin updated shipment status');
  end if;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,details)
  values(auth.uid(),'shipment_updated','shipment',p_shipment_id,jsonb_build_object('status',p_status,'driver_id',p_driver_id,'delivery_fee',p_delivery_fee));
end $$;

create or replace function public.assign_driver(p_shipment_id uuid,p_driver_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  perform public.admin_update_shipment(p_shipment_id,'driver_assigned',(select delivery_fee from public.shipments where id=p_shipment_id),p_driver_id);
end $$;

-- -------------------------
-- Driver/admin management
-- -------------------------
create or replace function public.admin_set_driver_availability(p_driver_id uuid,p_availability text)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  if p_availability not in ('available','busy','offline') then raise exception 'Invalid availability'; end if;
  update public.drivers set availability=p_availability where user_id=p_driver_id and verification_status='approved';
  if not found then raise exception 'Approved driver not found'; end if;
end $$;

create or replace function public.admin_suspend_driver(p_driver_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  update public.drivers set verification_status='rejected',availability='offline',updated_at=now() where user_id=p_driver_id;
  update public.profiles set role='customer',updated_at=now() where id=p_driver_id;
  insert into public.notifications(user_id,title,body) values(p_driver_id,'Driver access suspended','Your DAENITRYXX driver access has been suspended. Please contact support.');
end $$;

-- -------------------------
-- Customer/admin management
-- -------------------------
create or replace function public.admin_update_customer(p_customer_id uuid,p_full_name text,p_phone text)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  if not exists(select 1 from public.profiles where id=p_customer_id and role='customer') then raise exception 'Customer not found'; end if;
  update public.profiles set full_name=trim(p_full_name),phone=nullif(trim(coalesce(p_phone,'')),''),updated_at=now() where id=p_customer_id;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id) values(auth.uid(),'customer_updated','profile',p_customer_id);
end $$;

-- -------------------------
-- Support
-- -------------------------
create or replace function public.admin_update_support(p_request_id uuid,p_status text)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  if p_status not in ('open','in_progress','resolved','closed') then raise exception 'Invalid support status'; end if;
  update public.support_requests set status=p_status,updated_at=now(),assigned_to=coalesce(assigned_to,auth.uid()) where id=p_request_id;
  if not found then raise exception 'Support request not found'; end if;
end $$;

-- -------------------------
-- Payouts
-- -------------------------
create or replace function public.request_driver_payout(p_amount numeric,p_notes text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare pid uuid; available numeric;
begin
  if not public.is_driver() then raise exception 'Driver access required'; end if;
  if p_amount is null or p_amount<=0 then raise exception 'Invalid payout amount'; end if;
  select coalesce(sum(case when status in ('approved','paid') then amount else 0 end),0)
       - coalesce(sum(case when status='paid' then 0 else 0 end),0)
  into available from public.driver_earnings where driver_id=auth.uid();
  if p_amount>available then raise exception 'Requested amount exceeds approved earnings'; end if;
  insert into public.driver_payouts(driver_id,amount,status,notes) values(auth.uid(),p_amount,'pending',p_notes) returning id into pid;
  return pid;
end $$;

create or replace function public.admin_process_payout(p_payout_id uuid,p_status text,p_notes text default null)
returns void language plpgsql security definer set search_path=public as $$
declare d uuid; amount_value numeric;
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  if p_status not in ('approved','paid','rejected') then raise exception 'Invalid payout status'; end if;
  select driver_id,amount into d,amount_value from public.driver_payouts where id=p_payout_id for update;
  if d is null then raise exception 'Payout not found'; end if;
  update public.driver_payouts set status=p_status,notes=coalesce(p_notes,notes),processed_at=case when p_status in ('approved','paid','rejected') then now() else processed_at end where id=p_payout_id;
  insert into public.notifications(user_id,title,body) values(d,'Payout update','Your driver payout request is now '||p_status||'.');
end $$;

-- -------------------------
-- Cancellation
-- -------------------------
create or replace function public.cancel_shipment(p_shipment_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare current_status public.shipment_status;
begin
  select status into current_status from public.shipments where id=p_shipment_id and customer_id=auth.uid() for update;
  if current_status is null then raise exception 'Shipment not found'; end if;
  if current_status not in ('pending','confirmed') then raise exception 'This shipment can no longer be cancelled'; end if;
  update public.shipments set status='cancelled',cancelled_at=now(),driver_id=null where id=p_shipment_id;
  delete from public.delivery_assignments where shipment_id=p_shipment_id;
  insert into public.shipment_status_history(shipment_id,status,changed_by,note) values(p_shipment_id,'cancelled',auth.uid(),'Cancelled by customer');
end $$;

-- -------------------------
-- Tracking
-- -------------------------
create or replace function public.get_public_tracking(p_tracking_number text)
returns table(tracking_number text,status text,pickup_city text,delivery_city text,package_description text,updated_at timestamptz,history jsonb)
language sql security definer set search_path=public as $$
  select s.tracking_number,s.status::text,s.pickup_city,s.delivery_city,s.package_description,s.updated_at,
  coalesce((select jsonb_agg(jsonb_build_object('status',h.status::text,'note',h.note,'created_at',h.created_at) order by h.created_at) from public.shipment_status_history h where h.shipment_id=s.id),'[]'::jsonb)
  from public.shipments s where upper(s.tracking_number)=upper(trim(p_tracking_number)) limit 1;
$$;

create or replace function public.get_my_tracking(p_tracking_number text)
returns table(tracking_number text,status text,pickup_city text,delivery_city text,package_description text,updated_at timestamptz,history jsonb)
language plpgsql security definer set search_path=public as $$
declare sid uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select s.id into sid from public.shipments s where upper(s.tracking_number)=upper(trim(p_tracking_number))
    and (s.customer_id=auth.uid() or s.driver_id=auth.uid() or public.is_admin()) limit 1;
  if sid is null then return; end if;
  return query select s.tracking_number,s.status::text,s.pickup_city,s.delivery_city,s.package_description,s.updated_at,
    coalesce((select jsonb_agg(jsonb_build_object('status',h.status::text,'note',h.note,'created_at',h.created_at) order by h.created_at) from public.shipment_status_history h where h.shipment_id=s.id),'[]'::jsonb)
    from public.shipments s where s.id=sid;
end $$;

revoke all on function public.get_my_tracking(text) from public;
grant execute on function public.get_my_tracking(text) to authenticated;
revoke all on function public.get_public_tracking(text) from public;
grant execute on function public.get_public_tracking(text) to anon,authenticated;

-- -------------------------
-- RLS: reset policies to prevent privilege drift
-- -------------------------
alter table public.profiles enable row level security;
alter table public.driver_applications enable row level security;
alter table public.drivers enable row level security;
alter table public.shipments enable row level security;
alter table public.shipment_status_history enable row level security;
alter table public.delivery_assignments enable row level security;
alter table public.shipment_documents enable row level security;
alter table public.payments enable row level security;
alter table public.driver_earnings enable row level security;
alter table public.driver_payouts enable row level security;
alter table public.notifications enable row level security;
alter table public.support_requests enable row level security;
alter table public.audit_logs enable row level security;

do $$ declare p record; begin
  for p in select policyname,tablename from pg_policies where schemaname='public' and tablename in ('profiles','driver_applications','drivers','shipments','shipment_status_history','delivery_assignments','shipment_documents','payments','driver_earnings','driver_payouts','notifications','support_requests','audit_logs') loop
    execute format('drop policy if exists %I on public.%I',p.policyname,p.tablename);
  end loop;
end $$;

create policy profiles_select on public.profiles for select using(id=auth.uid() or public.is_admin());
create policy profiles_update_self on public.profiles for update using(id=auth.uid()) with check(id=auth.uid() and role=public.current_role());
create policy profiles_admin_all on public.profiles for all using(public.is_admin()) with check(public.is_admin());

create policy applications_select on public.driver_applications for select using(user_id=auth.uid() or public.is_admin());
create policy applications_admin_all on public.driver_applications for all using(public.is_admin()) with check(public.is_admin());

create policy drivers_select on public.drivers for select using(user_id=auth.uid() or public.is_admin());
create policy drivers_admin_all on public.drivers for all using(public.is_admin()) with check(public.is_admin());

create policy shipments_select on public.shipments for select using(customer_id=auth.uid() or driver_id=auth.uid() or public.is_admin());
create policy shipments_admin_all on public.shipments for all using(public.is_admin()) with check(public.is_admin());
-- Shipment creation/changes are performed through security-definer RPCs.

create policy history_select on public.shipment_status_history for select using(exists(select 1 from public.shipments s where s.id=shipment_id and (s.customer_id=auth.uid() or s.driver_id=auth.uid() or public.is_admin())));

create policy assignments_select on public.delivery_assignments for select using(driver_id=auth.uid() or public.is_admin());
create policy assignments_admin_all on public.delivery_assignments for all using(public.is_admin()) with check(public.is_admin());

create policy docs_select on public.shipment_documents for select using(uploaded_by=auth.uid() or public.is_admin() or exists(select 1 from public.shipments s where s.id=shipment_id and s.customer_id=auth.uid()));
create policy docs_driver_insert on public.shipment_documents for insert with check(uploaded_by=auth.uid() and public.is_driver() and exists(select 1 from public.shipments s where s.id=shipment_id and s.driver_id=auth.uid()));

create policy payments_select on public.payments for select using(customer_id=auth.uid() or public.is_admin());
create policy payments_admin_all on public.payments for all using(public.is_admin()) with check(public.is_admin());

create policy earnings_select on public.driver_earnings for select using(driver_id=auth.uid() or public.is_admin());
create policy payouts_select on public.driver_payouts for select using(driver_id=auth.uid() or public.is_admin());
create policy payouts_insert on public.driver_payouts for insert with check(driver_id=auth.uid() and public.is_driver());
create policy payouts_admin_update on public.driver_payouts for update using(public.is_admin()) with check(public.is_admin());

create policy notifications_select on public.notifications for select using(user_id=auth.uid());
create policy notifications_mark_read on public.notifications for update using(user_id=auth.uid()) with check(user_id=auth.uid());

create policy support_insert on public.support_requests for insert with check((auth.uid() is null and user_id is null) or user_id=auth.uid());
create policy support_select on public.support_requests for select using(user_id=auth.uid() or public.is_admin());
create policy support_admin_update on public.support_requests for update using(public.is_admin()) with check(public.is_admin());

create policy audit_admin_select on public.audit_logs for select using(public.is_admin());

-- Make security-definer functions non-public where appropriate.
revoke all on function public.review_driver_application(uuid,public.application_status,text) from public;
grant execute on function public.review_driver_application(uuid,public.application_status,text) to authenticated;
revoke all on function public.repair_approved_driver(uuid) from public;
grant execute on function public.repair_approved_driver(uuid) to authenticated;
revoke all on function public.driver_respond_assignment(uuid,public.assignment_status,text) from public;
grant execute on function public.driver_respond_assignment(uuid,public.assignment_status,text) to authenticated;
revoke all on function public.driver_update_delivery_status(uuid,public.shipment_status,text) from public;
grant execute on function public.driver_update_delivery_status(uuid,public.shipment_status,text) to authenticated;
revoke all on function public.admin_update_shipment(uuid,public.shipment_status,numeric,uuid) from public;
grant execute on function public.admin_update_shipment(uuid,public.shipment_status,numeric,uuid) to authenticated;
revoke all on function public.assign_driver(uuid,uuid) from public;
grant execute on function public.assign_driver(uuid,uuid) to authenticated;
revoke all on function public.admin_set_driver_availability(uuid,text) from public;
grant execute on function public.admin_set_driver_availability(uuid,text) to authenticated;
revoke all on function public.admin_suspend_driver(uuid) from public;
grant execute on function public.admin_suspend_driver(uuid) to authenticated;
revoke all on function public.admin_update_customer(uuid,text,text) from public;
grant execute on function public.admin_update_customer(uuid,text,text) to authenticated;
revoke all on function public.admin_update_support(uuid,text) from public;
grant execute on function public.admin_update_support(uuid,text) to authenticated;
revoke all on function public.request_driver_payout(numeric,text) from public;
grant execute on function public.request_driver_payout(numeric,text) to authenticated;
revoke all on function public.admin_process_payout(uuid,text,text) from public;
grant execute on function public.admin_process_payout(uuid,text,text) to authenticated;
revoke all on function public.cancel_shipment(uuid) from public;
grant execute on function public.cancel_shipment(uuid) to authenticated;

-- One-time repair for applications that were approved before this migration.
insert into public.drivers(user_id,vehicle_type,verification_status,availability)
select da.user_id,da.vehicle_type,'approved','available'
from public.driver_applications da
where da.status='approved'
on conflict(user_id) do update set
  vehicle_type=excluded.vehicle_type,
  verification_status='approved';

update public.profiles p
set role='driver',updated_at=now()
from public.driver_applications da
where da.user_id=p.id and da.status='approved';

-- Store normalized account email in profiles so admins can manage accounts
-- without exposing auth.users directly to the browser.
alter table public.profiles add column if not exists email text;
create unique index if not exists profiles_email_unique_idx on public.profiles(lower(email)) where email is not null;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  account_type text; full_name_value text; phone_value text; vehicle_value text; license_value text; notes_value text;
begin
  full_name_value := coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'),''), split_part(coalesce(new.email,''),'@',1));
  if char_length(full_name_value)<2 then full_name_value:='DAENITRYXX User'; end if;
  phone_value := nullif(trim(new.raw_user_meta_data->>'phone'),'');
  account_type := coalesce(new.raw_user_meta_data->>'account_type','customer');
  insert into public.profiles(id,email,full_name,phone)
  values(new.id,new.email,full_name_value,phone_value)
  on conflict(id) do update set email=excluded.email,full_name=excluded.full_name,phone=excluded.phone;
  if account_type='driver' then
    vehicle_value:=nullif(trim(new.raw_user_meta_data->>'vehicle_type'),'');
    license_value:=nullif(trim(new.raw_user_meta_data->>'license_reference'),'');
    notes_value:=nullif(trim(new.raw_user_meta_data->>'notes'),'');
    if phone_value is not null and char_length(phone_value)>=3 and vehicle_value is not null and char_length(vehicle_value)>=2 and license_value is not null and char_length(license_value)>=2 then
      insert into public.driver_applications(user_id,full_name,phone,vehicle_type,license_reference,notes,status)
      values(new.id,full_name_value,phone_value,vehicle_value,license_value,notes_value,'pending');
    end if;
  end if;
  return new;
end $$;

-- Backfill email for existing profiles when this migration is run.
update public.profiles p set email=u.email from auth.users u where u.id=p.id and (p.email is null or p.email<>u.email);

-- Correct shipment creation validation and notifications.
create or replace function public.create_shipment(
  p_pickup_name text,p_pickup_phone text,p_pickup_address text,p_pickup_city text,
  p_delivery_name text,p_delivery_phone text,p_delivery_address text,p_delivery_city text,
  p_package_description text,p_package_weight_kg numeric,p_delivery_fee numeric
) returns text language plpgsql security definer set search_path=public as $$
declare sid uuid; tracking text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if public.current_role()<>'customer' then raise exception 'Only customer accounts can create shipments'; end if;
  if nullif(trim(p_pickup_name),'') is null or nullif(trim(p_pickup_phone),'') is null or nullif(trim(p_pickup_address),'') is null or nullif(trim(p_pickup_city),'') is null then raise exception 'Complete pickup information is required'; end if;
  if nullif(trim(p_delivery_name),'') is null or nullif(trim(p_delivery_phone),'') is null or nullif(trim(p_delivery_address),'') is null or nullif(trim(p_delivery_city),'') is null then raise exception 'Complete delivery information is required'; end if;
  if nullif(trim(p_package_description),'') is null then raise exception 'Package description is required'; end if;
  if p_package_weight_kg is not null and p_package_weight_kg<0 then raise exception 'Weight cannot be negative'; end if;
  if p_delivery_fee is null or p_delivery_fee<0 then raise exception 'Delivery fee cannot be negative'; end if;
  insert into public.shipments(customer_id,pickup_name,pickup_phone,pickup_address,pickup_city,delivery_name,delivery_phone,delivery_address,delivery_city,package_description,package_weight_kg,delivery_fee)
  values(auth.uid(),trim(p_pickup_name),trim(p_pickup_phone),trim(p_pickup_address),trim(p_pickup_city),trim(p_delivery_name),trim(p_delivery_phone),trim(p_delivery_address),trim(p_delivery_city),trim(p_package_description),p_package_weight_kg,p_delivery_fee)
  returning id,tracking_number into sid,tracking;
  insert into public.shipment_status_history(shipment_id,status,changed_by,note) values(sid,'pending',auth.uid(),'Shipment request created');
  insert into public.notifications(user_id,title,body) values(auth.uid(),'Shipment created','Your shipment request '||tracking||' has been created and is pending confirmation.');
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,details) values(auth.uid(),'shipment_created','shipment',sid,jsonb_build_object('tracking_number',tracking));
  return tracking;
end $$;
revoke all on function public.create_shipment(text,text,text,text,text,text,text,text,text,numeric,numeric) from public;
grant execute on function public.create_shipment(text,text,text,text,text,text,text,text,text,numeric,numeric) to authenticated;

-- Correct assignment acceptance: accepting an assignment does not skip the required Driver Assigned state.
create or replace function public.driver_respond_assignment(p_assignment_id uuid,p_decision public.assignment_status,p_reason text default null)
returns void language plpgsql security definer set search_path=public as $$
declare sid uuid; current_status public.assignment_status; customer uuid;
begin
  if not public.is_driver() then raise exception 'Driver access required'; end if;
  if p_decision not in ('accepted','rejected') then raise exception 'Invalid assignment decision'; end if;
  select da.shipment_id,da.status,s.customer_id into sid,current_status,customer from public.delivery_assignments da join public.shipments s on s.id=da.shipment_id where da.id=p_assignment_id and da.driver_id=auth.uid() for update;
  if sid is null then raise exception 'Assignment not found'; end if;
  if current_status<>'offered' then raise exception 'Assignment is no longer awaiting a response'; end if;
  if p_decision='accepted' then
    update public.delivery_assignments set status='accepted',accepted_at=now() where id=p_assignment_id;
    update public.drivers set availability='busy' where user_id=auth.uid();
    insert into public.notifications(user_id,title,body) values(customer,'Driver accepted','Your delivery assignment has been accepted and is ready for pickup.');
  else
    update public.delivery_assignments set status='rejected',rejected_at=now() where id=p_assignment_id;
    update public.shipments set driver_id=null,status='confirmed',updated_at=now() where id=sid;
    insert into public.shipment_status_history(shipment_id,status,changed_by,note) values(sid,'confirmed',auth.uid(),coalesce(nullif(trim(p_reason),''),'Driver rejected assignment'));
    insert into public.notifications(user_id,title,body) values(customer,'Driver assignment declined','Your shipment is awaiting another driver assignment.');
  end if;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,details) values(auth.uid(),'driver_assignment_response','delivery_assignment',p_assignment_id,jsonb_build_object('decision',p_decision,'reason',p_reason));
end $$;

-- Driver can progress from a confirmed assignment to pickup.
create or replace function public.driver_update_delivery_status(p_assignment_id uuid,p_status public.shipment_status,p_note text default null)
returns void language plpgsql security definer set search_path=public as $$
declare sid uuid; assigned uuid; old_status public.shipment_status; customer uuid;
begin
  if not public.is_driver() then raise exception 'Driver access required'; end if;
  select shipment_id,driver_id into sid,assigned from public.delivery_assignments where id=p_assignment_id for update;
  if sid is null or assigned<>auth.uid() then raise exception 'Not authorized'; end if;
  select status,customer_id into old_status,customer from public.shipments where id=sid for update;
  if p_status not in ('picked_up','in_transit','out_for_delivery','delivered','failed_delivery') then raise exception 'Invalid driver status'; end if;
  if old_status in ('delivered','cancelled','failed_delivery') then raise exception 'Shipment is already closed'; end if;
  if p_status='picked_up' and old_status not in ('driver_assigned','confirmed') then raise exception 'Shipment is not ready for pickup'; end if;
  if p_status='in_transit' and old_status<>'picked_up' then raise exception 'Shipment must be picked up first'; end if;
  if p_status='out_for_delivery' and old_status<>'in_transit' then raise exception 'Shipment must be in transit first'; end if;
  if p_status='delivered' and old_status<>'out_for_delivery' then raise exception 'Shipment must be out for delivery first'; end if;

  update public.shipments set status=p_status,delivered_at=case when p_status='delivered' then now() else delivered_at end where id=sid;
  update public.delivery_assignments set status=case when p_status='delivered' then 'completed' else 'accepted' end,accepted_at=coalesce(accepted_at,now()),completed_at=case when p_status='delivered' then now() else completed_at end where id=p_assignment_id;
  if p_status='delivered' then update public.drivers set availability='available' where user_id=auth.uid(); end if;
  insert into public.shipment_status_history(shipment_id,status,changed_by,note) values(sid,p_status,p_note);
  insert into public.notifications(user_id,title,body) values(customer,'Shipment update','Your shipment status is now '||replace(p_status::text,'_',' '));
  if p_status='delivered' then
    insert into public.driver_earnings(driver_id,shipment_id,amount,status)
    select auth.uid(),sid,greatest(s.delivery_fee,0),'approved' from public.shipments s where s.id=sid
    and not exists(select 1 from public.driver_earnings e where e.shipment_id=sid and e.driver_id=auth.uid());
  end if;
end $$;

-- Correct payout balance so the same earnings cannot be requested repeatedly.
create or replace function public.request_driver_payout(p_amount numeric,p_notes text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare pid uuid; earned numeric; reserved numeric; available numeric;
begin
  if not public.is_driver() then raise exception 'Driver access required'; end if;
  if p_amount is null or p_amount<=0 then raise exception 'Invalid payout amount'; end if;
  select coalesce(sum(amount),0) into earned from public.driver_earnings where driver_id=auth.uid() and status in ('approved','paid');
  select coalesce(sum(amount),0) into reserved from public.driver_payouts where driver_id=auth.uid() and status in ('pending','approved','paid');
  available:=greatest(earned-reserved,0);
  if p_amount>available then raise exception 'Requested amount exceeds available earnings'; end if;
  insert into public.driver_payouts(driver_id,amount,status,notes) values(auth.uid(),p_amount,'pending',p_notes) returning id into pid;
  return pid;
end $$;

-- Keep assignment/status consistent when an admin assigns a driver.
create or replace function public.admin_update_shipment(p_shipment_id uuid,p_status public.shipment_status,p_delivery_fee numeric,p_driver_id uuid default null)
returns void language plpgsql security definer set search_path=public as $$
declare old_driver uuid; old_status public.shipment_status; final_status public.shipment_status;
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  if p_delivery_fee is null or p_delivery_fee<0 then raise exception 'Invalid delivery fee'; end if;
  select driver_id,status into old_driver,old_status from public.shipments where id=p_shipment_id for update;
  if old_status is null then raise exception 'Shipment not found'; end if;
  if p_driver_id is not null and not exists(select 1 from public.drivers where user_id=p_driver_id and verification_status='approved') then raise exception 'Driver is not approved'; end if;
  final_status:=case when p_driver_id is not null and p_status in ('pending','confirmed') then 'driver_assigned' else p_status end;
  update public.shipments set status=final_status,delivery_fee=p_delivery_fee,driver_id=p_driver_id,delivered_at=case when final_status='delivered' then coalesce(delivered_at,now()) else delivered_at end where id=p_shipment_id;
  if p_driver_id is not null then
    insert into public.delivery_assignments(shipment_id,driver_id,status,assigned_at) values(p_shipment_id,p_driver_id,'offered',now())
    on conflict(shipment_id) do update set driver_id=excluded.driver_id,status='offered',assigned_at=now(),accepted_at=null,rejected_at=null,completed_at=null;
    insert into public.notifications(user_id,title,body) values(p_driver_id,'New delivery assignment','You have been assigned a shipment. Please review and accept it.');
  else
    delete from public.delivery_assignments where shipment_id=p_shipment_id;
  end if;
  if old_status is distinct from final_status then
    insert into public.shipment_status_history(shipment_id,status,changed_by,note) values(p_shipment_id,final_status,auth.uid(),'Admin updated shipment status');
  end if;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,details) values(auth.uid(),'shipment_updated','shipment',p_shipment_id,jsonb_build_object('status',final_status,'driver_id',p_driver_id,'delivery_fee',p_delivery_fee));
end $$;

-- Require proof-of-delivery before a driver can close a shipment as delivered.
create or replace function public.driver_update_delivery_status(p_assignment_id uuid,p_status public.shipment_status,p_note text default null)
returns void language plpgsql security definer set search_path=public as $$
declare sid uuid; assigned uuid; old_status public.shipment_status; customer uuid;
begin
  if not public.is_driver() then raise exception 'Driver access required'; end if;
  select shipment_id,driver_id into sid,assigned from public.delivery_assignments where id=p_assignment_id for update;
  if sid is null or assigned<>auth.uid() then raise exception 'Not authorized'; end if;
  select status,customer_id into old_status,customer from public.shipments where id=sid for update;
  if p_status not in ('picked_up','in_transit','out_for_delivery','delivered','failed_delivery') then raise exception 'Invalid driver status'; end if;
  if old_status in ('delivered','cancelled','failed_delivery') then raise exception 'Shipment is already closed'; end if;
  if p_status='picked_up' and old_status not in ('driver_assigned','confirmed') then raise exception 'Shipment is not ready for pickup'; end if;
  if p_status='in_transit' and old_status<>'picked_up' then raise exception 'Shipment must be picked up first'; end if;
  if p_status='out_for_delivery' and old_status<>'in_transit' then raise exception 'Shipment must be in transit first'; end if;
  if p_status='delivered' and old_status<>'out_for_delivery' then raise exception 'Shipment must be out for delivery first'; end if;
  if p_status='delivered' and not exists(select 1 from public.shipment_documents where shipment_id=sid and uploaded_by=auth.uid() and document_type='proof_of_delivery') then raise exception 'Upload proof of delivery before marking the shipment delivered'; end if;
  update public.shipments set status=p_status,delivered_at=case when p_status='delivered' then now() else delivered_at end where id=sid;
  update public.delivery_assignments set status=case when p_status='delivered' then 'completed' else 'accepted' end,accepted_at=coalesce(accepted_at,now()),completed_at=case when p_status='delivered' then now() else completed_at end where id=p_assignment_id;
  if p_status='delivered' then update public.drivers set availability='available' where user_id=auth.uid(); end if;
  insert into public.shipment_status_history(shipment_id,status,changed_by,note) values(sid,p_status,p_note);
  insert into public.notifications(user_id,title,body) values(customer,'Shipment update','Your shipment status is now '||replace(p_status::text,'_',' '));
  if p_status='delivered' then
    insert into public.driver_earnings(driver_id,shipment_id,amount,status)
    select auth.uid(),sid,greatest(s.delivery_fee,0),'approved' from public.shipments s where s.id=sid
    and not exists(select 1 from public.driver_earnings e where e.shipment_id=sid and e.driver_id=auth.uid());
  end if;
end $$;



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
