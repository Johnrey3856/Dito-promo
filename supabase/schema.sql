-- Run this in Supabase → SQL Editor.
-- Also: Authentication → Providers → Email → turn OFF "Confirm email".

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  mobile text unique not null,
  created_at timestamptz not null default now()
);

create table if not exists public.promos (
  id text primary key,
  category text not null,
  tag text not null,
  title text not null,
  description text not null,
  price text not null,
  detail text not null,
  icon text not null,
  perks text[] not null default '{}',
  sort int not null default 0,
  active boolean not null default true
);

create table if not exists public.claimed_promos (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  promo_id text not null references public.promos(id),
  claimed_at timestamptz not null default now(),
  unique (user_id, promo_id)
);

-- Create a profile row automatically when someone registers.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, mobile) values (new.id, new.raw_user_meta_data->>'mobile');
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Row Level Security
alter table public.profiles enable row level security;
alter table public.promos enable row level security;
alter table public.claimed_promos enable row level security;

create policy "promos are public" on public.promos for select using (true);
create policy "own profile" on public.profiles for select using (auth.uid() = id);
create policy "own claims: read" on public.claimed_promos for select using (auth.uid() = user_id);
create policy "own claims: insert" on public.claimed_promos for insert with check (auth.uid() = user_id);

-- Seed offers (demo values)
insert into public.promos (id, category, tag, title, description, price, detail, icon, perks, sort) values
('data-boost','Data','DATA BOOST','More data. More doing.','Stay connected to what matters with data offers made for your everyday.','₱99','30 GB • 7 days','Zap','{"30 GB of mobile data","Valid for 7 days","Works for browsing, social apps, and video"}',1),
('unli-connection','Bundles','UNLI CONNECTION','Stream, scroll, repeat.','Find a promo that keeps your favorite apps and people within reach.','₱149','Unli apps • 15 days','Wifi','{"Unlimited access to popular apps","Valid for 15 days","Great for streaming and chatting"}',2),
('extra-value','Bundles','EXTRA VALUE','A little more in every load.','Discover prepaid deals and bundles that fit your budget.','₱199','Data + calls • 30 days','Gift','{"Data, calls, and texts in one bundle","Valid for 30 days","Best value for everyday use"}',3),
('mega-data','Data','MEGA DATA','Go big on data.','A generous data allowance for heavy scrollers, streamers, and downloaders.','₱299','100 GB • 30 days','Globe','{"100 GB of mobile data","Valid for 30 days","Perfect for work, school, and play"}',4),
('daily-lite','Data','DAILY LITE','Just what you need today.','A small, budget-friendly pack for quick browsing and messaging.','₱49','5 GB • 3 days','Zap','{"5 GB of mobile data","Valid for 3 days","Great for short-term top-ups"}',5),
('game-zone','Entertainment','GAME ZONE','Level up your connection.','Low-lag data made for mobile gamers and their squads.','₱129','Game data • 15 days','Gamepad2','{"Dedicated data for popular mobile games","Valid for 15 days","Smooth play, less lag"}',6),
('stream-zone','Entertainment','STREAM ZONE','Press play, keep going.','Binge your favorite shows, videos, and music without worry.','₱179','Streaming data • 30 days','Tv','{"Data for video and music apps","Valid for 30 days","Watch and listen anywhere"}',7),
('music-pass','Entertainment','MUSIC PASS','Your soundtrack, always on.','Unlimited music streaming to keep the playlist going all day.','₱59','Music apps • 7 days','Music','{"Unlimited music streaming","Valid for 7 days","Works on popular music apps"}',8),
('call-text','Calls & Texts','CALL & TEXT','Talk more, worry less.','Stay in touch with family and friends with calls and texts bundled in.','₱79','Calls + texts • 15 days','Phone','{"Unli calls and texts to DITO","Valid for 15 days","Keep close to the people who matter"}',9),
('home-broadband','Bundles','HOME FAMILY','Connection for the whole home.','A shared bundle so everyone at home stays online together.','₱499','Family data • 30 days','Home','{"Shared data for the whole family","Valid for 30 days","Great for work-from-home and study"}',10)
on conflict (id) do nothing;
