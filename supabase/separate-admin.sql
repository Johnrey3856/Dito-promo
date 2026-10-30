-- =====================================================
-- SEPARATE ADMINS FROM CUSTOMERS
-- Run in Supabase → SQL Editor (after schema.sql and security.sql). Safe to run again.
--
--   CUSTOMERS:  profiles, claimed_promos, login_attempts
--   ADMINS:     admins,   admin_login_attempts
-- =====================================================

-- 1) Admins get readable columns --------------------------------------
alter table public.admins add column if not exists username text;
alter table public.admins add column if not exists email text;
update public.admins a
   set email = u.email, username = split_part(u.email, '@', 1)
  from auth.users u
 where u.id = a.user_id and (a.email is null or a.username is null);

-- 2) Admin sign-ins get their own log table ---------------------------
create table if not exists public.admin_login_attempts (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  username text,
  success boolean not null,
  blocked boolean not null default false,
  reason text,
  ip text,
  user_agent text,
  origin text,
  language text,
  meta jsonb not null default '{}'
);
create index if not exists admin_login_attempts_time_idx on public.admin_login_attempts (created_at desc);
create index if not exists admin_login_attempts_ip_idx on public.admin_login_attempts (ip, created_at desc);

alter table public.admin_login_attempts enable row level security;
drop policy if exists "admin all" on public.admin_login_attempts;
create policy "admin all" on public.admin_login_attempts for all using (public.is_admin()) with check (public.is_admin());

-- 3) Move old admin sign-ins out of the customer log ------------------
insert into public.admin_login_attempts (created_at, username, success, blocked, reason, ip, user_agent, origin, language, meta)
select created_at, mobile, success, blocked, reason, ip, user_agent, origin, language, meta
  from public.login_attempts
 where kind = 'login' and (mobile = 'admin' or position('@' in coalesce(mobile, '')) > 0);
delete from public.login_attempts
 where kind = 'login' and (mobile = 'admin' or position('@' in coalesce(mobile, '')) > 0);

-- 4) Only customers (real mobile numbers) get a profile ---------------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (new.raw_user_meta_data->>'mobile') ~ '^09[0-9]{9}$' then
    insert into public.profiles (id, mobile) values (new.id, new.raw_user_meta_data->>'mobile')
    on conflict (id) do nothing;
  end if;
  return new;
end $$;

-- remove admin rows from profiles (triggers paused so no login gets deleted)
alter table public.profiles disable trigger user;
delete from public.profiles where mobile !~ '^09[0-9]{9}$';
alter table public.profiles enable trigger user;

-- 5) Defender for the admin sign-in -----------------------------------
create or replace function public.admin_check_login_allowed(p_username text) returns json
language plpgsql security definer set search_path = public as $$
declare
  s public.security_settings;
  v_ip text := public.request_ip();
  b public.blocked_ips;
  fails int; last_fail timestamptz; wait int;
begin
  select * into s from public.security_settings where id = 1;
  if v_ip is not null then
    select * into b from public.blocked_ips where ip = v_ip and (expires_at is null or expires_at > now());
    if found then
      return json_build_object('allowed', false, 'reason', 'ip_blocked',
        'retry_after', coalesce(ceil(extract(epoch from (b.expires_at - now())))::int, 0));
    end if;
    select count(*), max(created_at) into fails, last_fail from public.admin_login_attempts
      where ip = v_ip and success = false and blocked = false
        and created_at > now() - make_interval(mins => s.window_minutes);
    if fails >= s.max_failures then
      wait := ceil(extract(epoch from (last_fail + make_interval(mins => s.lockout_minutes) - now())))::int;
      if wait > 0 then return json_build_object('allowed', false, 'reason', 'ip_locked', 'retry_after', wait); end if;
    end if;
  end if;
  if p_username is not null and p_username <> '' then
    select count(*), max(created_at) into fails, last_fail from public.admin_login_attempts
      where username = lower(p_username) and success = false and blocked = false
        and created_at > now() - make_interval(mins => s.window_minutes);
    if fails >= s.max_failures * 2 then
      wait := ceil(extract(epoch from (last_fail + make_interval(mins => s.lockout_minutes) - now())))::int;
      if wait > 0 then return json_build_object('allowed', false, 'reason', 'account_locked', 'retry_after', wait); end if;
    end if;
  end if;
  return json_build_object('allowed', true);
end $$;

create or replace function public.admin_record_attempt(
  p_username text, p_success boolean, p_blocked boolean default false,
  p_reason text default null, p_meta jsonb default '{}'
) returns void
language plpgsql security definer set search_path = public as $$
declare
  s public.security_settings;
  v_ip text := public.request_ip();
  h json;
  fails int;
begin
  begin h := current_setting('request.headers', true)::json; exception when others then h := null; end;
  insert into public.admin_login_attempts (username, success, blocked, reason, ip, user_agent, origin, language, meta)
  values (left(lower(p_username), 60), coalesce(p_success, false), coalesce(p_blocked, false), left(p_reason, 60), v_ip,
          left(h->>'user-agent', 300), left(coalesce(h->>'origin', h->>'referer'), 200), left(h->>'accept-language', 60),
          coalesce(p_meta, '{}'::jsonb));

  -- guessing admin passwords is serious: block the IP at twice the normal lockout threshold
  if v_ip is not null and not coalesce(p_success, false) and not coalesce(p_blocked, false) then
    select * into s from public.security_settings where id = 1;
    if s.auto_block then
      select count(*) into fails from public.admin_login_attempts
        where ip = v_ip and success = false and blocked = false and created_at > now() - interval '60 minutes';
      if fails >= s.max_failures * 2 then
        insert into public.blocked_ips (ip, reason, auto, expires_at)
        values (v_ip, 'Auto-blocked: ' || fails || ' failed ADMIN sign-ins in 60 minutes', true, now() + make_interval(hours => s.auto_block_hours))
        on conflict (ip) do update set expires_at = excluded.expires_at, reason = excluded.reason, auto = true, blocked_at = now();
      end if;
    end if;
  end if;
end $$;

grant execute on function public.admin_check_login_allowed(text) to anon, authenticated;
grant execute on function public.admin_record_attempt(text, boolean, boolean, text, jsonb) to anon, authenticated;

-- 6) Customer defender ignores anything that isn't a customer number ---
create or replace function public.record_login_attempt(
  p_mobile text, p_success boolean, p_kind text default 'login',
  p_blocked boolean default false, p_reason text default null, p_meta jsonb default '{}'
) returns void
language plpgsql security definer set search_path = public as $$
declare
  s public.security_settings;
  v_ip text := public.request_ip();
  h json;
  fails int;
begin
  begin h := current_setting('request.headers', true)::json; exception when others then h := null; end;
  insert into public.login_attempts (kind, mobile, success, blocked, reason, ip, user_agent, origin, language, meta)
  values (
    case when p_kind in ('login','register') then p_kind else 'login' end,
    left(p_mobile, 20), coalesce(p_success, false), coalesce(p_blocked, false), left(p_reason, 60), v_ip,
    left(h->>'user-agent', 300), left(coalesce(h->>'origin', h->>'referer'), 200), left(h->>'accept-language', 60),
    coalesce(p_meta, '{}'::jsonb)
  );
  if v_ip is not null and not coalesce(p_success, false) and not coalesce(p_blocked, false) then
    select * into s from public.security_settings where id = 1;
    if s.auto_block then
      select count(*) into fails from public.login_attempts
        where ip = v_ip and success = false and blocked = false and created_at > now() - interval '60 minutes';
      if fails >= s.auto_block_failures then
        insert into public.blocked_ips (ip, reason, auto, expires_at)
        values (v_ip, 'Auto-blocked: ' || fails || ' failed attempts in 60 minutes', true, now() + make_interval(hours => s.auto_block_hours))
        on conflict (ip) do update set expires_at = excluded.expires_at, reason = excluded.reason, auto = true, blocked_at = now();
      end if;
    end if;
  end if;
end $$;

-- 7) Check the result --------------------------------------------------
select 'admins' as what, count(*) from public.admins
union all select 'customers (profiles)', count(*) from public.profiles
union all select 'admin sign-ins logged', count(*) from public.admin_login_attempts
union all select 'customer attempts logged', count(*) from public.login_attempts;
