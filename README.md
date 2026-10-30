# DITO Promo (independent demo)

A React + Vite promo website with Supabase accounts, a promo "claim" flow, and **DITO Sentinel** — an admin dashboard that tracks brute-force login attacks (IP, location, device) and blocks attackers.

> Independent demo project. Not affiliated with or endorsed by DITO Telecommunity. No real purchases happen.

## Features
- Promo site: offers with tabs, a free-promo claim page, register / login by mobile number + password.
- Accounts and claims stored in Supabase; logins persist across reloads.
- **Brute-force defender:** every login/register attempt is logged with the server-seen IP, lockouts after repeated failures, automatic IP blocking.
- **Admin dashboard** (`#/admin`): live attack feed, world map of attackers, per-IP risk profile, attempt log + CSV export, blocklist, customers, admins, offers, defender rules.
- Admins and customers are fully separate (own tables, own sign-in log, own browser session).

## Run it
```bash
npm install
cp .env.example .env      # then fill in your Supabase URL and anon key
npm run dev
```
Without `.env` the site still runs using browser-only demo storage.
Preview the admin design with sample data at `http://localhost:5173/#/admin/demo`.

## Supabase setup
In **Supabase → SQL Editor** run, in order:
1. `supabase/schema.sql` — tables, security rules, the 10 offers
2. `supabase/security.sql` — admin + brute-force defender
3. `supabase/separate-admin.sql` — keeps admins apart from customers
4. `supabase/harden-ip.sql` — only accepts real IP formats
5. `supabase/realtime.sql` — instant dashboard updates (optional)

Then **Authentication → Sign In / Providers → Email**: enable it and turn **off "Confirm email"**.

### Create an admin
Create a login in **Authentication → Users** (e.g. `manager@dito-demo.app`, auto-confirm), then:
```sql
insert into public.admins (user_id)
select id from auth.users where email = 'manager@dito-demo.app';
```
Sign in at `/#/admin` with the part before `@` as the username. **Use a strong, unique password.**

## Security notes
- Only the Supabase **anon** key belongs in `.env`. Never use the `service_role` key in this app.
- `.env` is git-ignored — do not commit it.
- The defender works inside the website's login. Someone calling Supabase's auth endpoint directly bypasses it; a Supabase Edge Function or a paid Auth protection is the next step for real traffic.
- IPs and devices are personal data — mention this in a privacy notice if real people use the site.
- Customer sign-in uses a hidden email derived from the mobile number (no email is sent). For real customers, use Supabase phone auth with an SMS provider.

## Stack
React 18 · Vite 6 · Supabase (Postgres, Auth, Realtime) · Leaflet · lucide-react
