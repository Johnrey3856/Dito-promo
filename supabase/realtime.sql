-- Turns on live push updates for the admin dashboard.
-- Run once in Supabase → SQL Editor. Safe to run again.
do $$
declare t text;
begin
  foreach t in array array['login_attempts', 'admin_login_attempts', 'blocked_ips'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then
      null; -- already enabled
    end;
  end loop;
end $$;
