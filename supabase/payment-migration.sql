-- Payment hardening migration. No provider secret is stored in the browser.
-- Deploy the Edge Functions after setting provider secrets.

-- Optional but useful status/timeline notification trigger is handled by application RPCs.

-- First-admin promotion example (replace email before running):
-- update public.profiles set role='admin' where lower(email)=lower('admin@example.com');
