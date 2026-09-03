# DAENITRYXX Supabase setup

1. Create a Supabase project.
2. Run `schema.sql` in the SQL Editor.
3. Create a **private** Storage bucket named `delivery-proofs`, then run `storage-policies.sql`.
4. In `js/supabase-config.js`, set only the project URL and anon/public key. Never put `service_role` there.
5. In Supabase Auth:
   - enable email/password;
   - configure Site URL and redirect URLs for your deployed domain;
   - configure SMTP for production email delivery.
6. Create the first administrator safely. Do not allow public role assignment:
   - create a normal auth user;
   - after account creation, in the SQL editor set `profiles.role='admin'` for that exact UUID.
   - remove/disable that SQL access for normal operators.
7. Deploy the Edge Functions under `supabase/functions/`.
8. Set Edge Function secrets only in Supabase project secrets:
   - `PAYMENT_PROVIDER` = `paystack` or `flutterwave`
   - `PAYSTACK_SECRET_KEY` OR `FLW_SECRET_KEY`
   - `APP_BASE_URL`
9. Connect your production payment initialization/checkout UI to `create-payment`, and call `verify-payment` from your payment return/webhook workflow. Never trust a browser-only "success" callback.
10. Configure a transactional email provider/SMTP in Supabase Auth.
11. Review all RLS policies with your security team before launch and test as customer, driver and admin accounts.

## Important security notes

- Public tracking uses `get_public_tracking`, which returns only shipment fields intended for tracking.
- Admin functions are `SECURITY DEFINER` and explicitly check `public.is_admin()`.
- Driver status changes go through `driver_update_delivery_status`.
- Driver approval goes through `review_driver_application`.
- Shipment creation goes through `create_shipment`.
- Payment verification must remain server-side.


## Create the first administrator
1. In Supabase Dashboard → Authentication → Users, create a real user with the admin email/password you want to use.
2. The `on_auth_user_created` trigger creates the matching `public.profiles` row automatically.
3. In Supabase SQL Editor, verify the email and promote only that account:

```sql
update public.profiles p
set role = 'admin', updated_at = now()
from auth.users u
where p.id = u.id
  and lower(u.email) = lower('YOUR-ADMIN-EMAIL@example.com');
```

4. Sign out/in again, then open `/admin/index.html`. The frontend checks the profile role and RLS policies enforce the same authorization in the database.

Do not add `admin` to the public registration form and do not put a service-role key in browser JavaScript.


## Driver application flow

1. A driver opens `driver-register.html` and submits their real name, email, phone, vehicle, license/ID reference, password, and optional note.
2. Supabase Auth creates the real user. The signup metadata includes `account_type=driver` plus the application fields.
3. The `on_auth_user_created` database trigger automatically inserts a row into `public.driver_applications` with status `pending`. This happens even when email confirmation is enabled, so the driver does not have to submit the form a second time after confirming their email.
4. The driver remains a normal authenticated user with the `customer` profile role until an administrator approves the application.
5. The administrator signs into the admin dashboard and reviews the application. Approving it changes the profile role to `driver` and creates the driver's approved record.
6. Only then can the driver use the driver dashboard and receive delivery assignments.
