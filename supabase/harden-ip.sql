-- Only accept a real-looking IP address from the request headers (blocks fake or oversized header values).
-- Run once in Supabase → SQL Editor. Safe to run again.
create or replace function public.request_ip() returns text
language plpgsql stable as $$
declare h json; v text;
begin
  begin h := current_setting('request.headers', true)::json; exception when others then return null; end;
  if h is null then return null; end if;
  v := coalesce(nullif(h->>'cf-connecting-ip',''), nullif(h->>'x-real-ip',''),
                nullif(trim(split_part(coalesce(h->>'x-forwarded-for',''), ',', 1)), ''));
  if v is null or length(v) > 45 or v !~ '^[0-9a-fA-F:.]+$' then return null; end if;
  return v;
end $$;
