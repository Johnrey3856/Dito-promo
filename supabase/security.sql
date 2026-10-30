-- =====================================================
-- DITO SENTINEL — admin + brute-force defender
-- Run AFTER schema.sql, in Supabase → SQL Editor. Safe to run again.
-- =====================================================

-- 1) TABLES ------------------------------------------
create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.login_attempts (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  kind text not null default 'login',          -- login | register
  mobile text,                                  -- number that was targeted
  success boolean not null,
  blocked boolean not null default false,       -- true = we refused the attempt (lockout / IP block)
  reason text,
  ip text,                                      -- captured on the server from request headers
  user_agent text,
  origin text,
  language text,
  meta jsonb not null default '{}'              -- timezone, screen, platform (informational)
);
create index if not exists login_attempts_time_idx on public.login_attempts (created_at desc);
create index if not exists login_attempts_ip_idx on public.login_attempts (ip, created_at desc);
create index if not exists login_attempts_mobile_idx on public.login_attempts (mobile, created_at desc);

create table if not exists public.blocked_ips (
  ip text primary key,
  reason text,
  auto boolean not null default false,
  blocked_at timestamptz not null default now(),
  expires_at timestamptz,                       -- null = permanent
  note text
);

create table if not exists public.ip_geo (
  ip text primary key,
  country text, country_code text, region text, city text,
  lat double precision, lon double precision,
  isp text, org text, asn text, timezone text,
  fetched_at timestamptz not null default now()
);

create table if not exists public.security_settings (
  id int primary key default 1 check (id = 1),
  max_failures int not null default 5,          -- failures allowed ...
  window_minutes int not null default 15,       -- ... inside this window
  lockout_minutes int not null default 15,      -- then locked for this long
  auto_block boolean not null default true,
  auto_block_failures int not null default 20,  -- failures in 60 min that trigger an automatic IP block
  auto_block_hours int not null default 24
);
insert into public.security_settings (id) values (1) on conflict (id) do nothing;

-- 2) HELPERS -----------------------------------------
create or replace function public.is_admin() returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- The caller's IP, read on the server from the request headers (cannot be faked through the app).
create or replace function public.request_ip() returns text
language plpgsql stable as $$
declare h json;
begin
  begin h := current_setting('request.headers', true)::json; exception when others then return null; end;
  if h is null then return null; end if;
  return coalesce(nullif(h->>'cf-connecting-ip',''), nullif(h->>'x-real-ip',''),
                  nullif(trim(split_part(coalesce(h->>'x-forwarded-for',''), ',', 1)), ''));
end $$;

-- 3) DEFENDER: is this request allowed to try a login? ---
create or replace function public.check_login_allowed(p_mobile text) returns json
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

    select count(*), max(created_at) into fails, last_fail from public.login_attempts
      where ip = v_ip and kind = 'login' and success = false and blocked = false
        and created_at > now() - make_interval(mins => s.window_minutes);
    if fails >= s.max_failures then
      wait := ceil(extract(epoch from (last_fail + make_interval(mins => s.lockout_minutes) - now())))::int;
      if wait > 0 then return json_build_object('allowed', false, 'reason', 'ip_locked', 'retry_after', wait); end if;
    end if;
  end if;

  if p_mobile is not null and p_mobile <> '' then
    select count(*), max(created_at) into fails, last_fail from public.login_attempts
      where mobile = p_mobile and kind = 'login' and success = false and blocked = false
        and created_at > now() - make_interval(mins => s.window_minutes);
    if fails >= s.max_failures * 2 then   -- targeted account under attack, even from many IPs
      wait := ceil(extract(epoch from (last_fail + make_interval(mins => s.lockout_minutes) - now())))::int;
      if wait > 0 then return json_build_object('allowed', false, 'reason', 'account_locked', 'retry_after', wait); end if;
    end if;
  end if;

  return json_build_object('allowed', true);
end $$;

-- 4) DEFENDER: record every attempt (and auto-block heavy attackers) ---
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

-- 5) ADMIN ACTIONS -------------------------------------
create or replace function public.admin_block_ip(p_ip text, p_reason text, p_hours int default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  insert into public.blocked_ips (ip, reason, auto, expires_at)
  values (p_ip, p_reason, false, case when p_hours is null then null else now() + make_interval(hours => p_hours) end)
  on conflict (ip) do update set reason = excluded.reason, auto = false, blocked_at = now(), expires_at = excluded.expires_at;
end $$;

create or replace function public.admin_delete_user(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  delete from auth.users where id = p_id;
end $$;

grant execute on function public.check_login_allowed(text) to anon, authenticated;
grant execute on function public.record_login_attempt(text, boolean, text, boolean, text, jsonb) to anon, authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.admin_block_ip(text, text, int) to authenticated;
grant execute on function public.admin_delete_user(uuid) to authenticated;

-- 6) SECURITY (Row Level Security): only admins can read the security data -----
alter table public.admins enable row level security;
alter table public.login_attempts enable row level security;
alter table public.blocked_ips enable row level security;
alter table public.ip_geo enable row level security;
alter table public.security_settings enable row level security;

do $$
declare t text;
begin
  foreach t in array array['admins','login_attempts','blocked_ips','ip_geo','security_settings'] loop
    execute format('drop policy if exists "admin all" on public.%I', t);
    execute format('create policy "admin all" on public.%I for all using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;

-- admins can also see everyone and manage offers
drop policy if exists "admin read profiles" on public.profiles;
create policy "admin read profiles" on public.profiles for select using (public.is_admin());
drop policy if exists "admin read claims" on public.claimed_promos;
create policy "admin read claims" on public.claimed_promos for select using (public.is_admin());
drop policy if exists "admin manage promos" on public.promos;
create policy "admin manage promos" on public.promos for all using (public.is_admin()) with check (public.is_admin());

-- =====================================================
-- MAKE YOURSELF AN ADMIN (run once, after registering your number on the site):
--   insert into public.admins (user_id)
--   select id from auth.users where email = '09XXXXXXXXX@dito-demo.app';
-- =====================================================
