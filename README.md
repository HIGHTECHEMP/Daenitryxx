# DAENITRYXX

Production-oriented vanilla HTML5/CSS3/ES6 logistics platform backed by Supabase. No demo records are inserted.

## Public pages
Home, About, Services, Shipping/Delivery Solutions, Track Shipment, Contact, FAQ, Login, Customer Registration and Driver/Agent Registration.

## Real workflows
- Supabase email/password authentication.
- Customer shipment creation with generated tracking numbers.
- Protected customer shipment history and authenticated tracking.
- Public tracking with limited data.
- Driver applications automatically created by the Supabase auth trigger.
- Admin approval atomically promotes the applicant to `driver` and creates the `drivers` record.
- Admin shipment assignment and status/fee management.
- Driver accept/reject workflow and ordered delivery statuses.
- Proof-of-delivery upload to a private Storage bucket; proof is required before delivery can be closed.
- Customer/driver notifications and read state.
- Driver earnings and payout requests with admin processing.
- Customer, driver, shipment, payment, support and audit sections in the admin console.
- Paystack/Flutterwave checkout and server-side verification Edge Function structure.
- RLS prevents customers/drivers from reading or changing other users' protected data.

## Existing Supabase project (recommended for your current database)
1. Keep your existing data.
2. Run `supabase/production-migration.sql` in Supabase SQL Editor.
3. Create a **private** Storage bucket named `delivery-proofs`.
4. Run `supabase/storage-policies.sql`.
5. Set `js/supabase-config.js` to your project's public URL and anon key. Never place a service-role key in frontend code.
6. If you already have an approved driver from an earlier version, `production-migration.sql` repairs approved applications into the `drivers` table automatically.

## Fresh Supabase project
Run `supabase/schema.sql`, then create the private `delivery-proofs` bucket and run `supabase/storage-policies.sql`.

## First administrator
Create the real account in Supabase Authentication, then run:

```sql
update public.profiles
set role='admin', updated_at=now()
where lower(email)=lower('YOUR-ADMIN-EMAIL@example.com');
```

## Payments
Deploy the Edge Functions in `supabase/functions/`. Set:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `PAYSTACK_SECRET_KEY` and/or `FLW_SECRET_KEY`
- `PUBLIC_SITE_URL` (recommended for payment redirects)

The browser never receives provider secrets. Payment records are marked successful only after provider-side verification.

## Frontend
Serve over HTTP(S), not `file://`, because ES modules require a web origin. Example:

```bash
python -m http.server 8080
```

## QA checklist
Test with separate real customer, driver and admin accounts: registration, login/logout, password reset, driver application, approval, approved-driver list, shipment creation, admin assignment, driver acceptance/rejection, status progression, proof upload, delivery completion, customer tracking, notifications, payment initialization/verification, support, payout request/processing, and RLS isolation.

The design uses the supplied first image as the main visual direction and the supplied second image only for tracking-page hierarchy. The interface is mobile-first and avoids horizontal overflow through responsive navigation, tables and dashboard layouts.
