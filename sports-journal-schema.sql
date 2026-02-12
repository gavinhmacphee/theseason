-- ============================================
-- SPORTS JOURNAL - Supabase Database Schema
-- Run this in Supabase SQL Editor
-- ============================================

-- 1. PROFILES TABLE
create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null unique,
  display_name text,
  role text not null check (role in ('coach', 'parent', 'player')),
  created_at timestamptz default now() not null
);

alter table public.profiles enable row level security;

create policy "Users can read own profile"
  on public.profiles for select
  using (auth.uid() = user_id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = user_id);

create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = user_id);

-- Auto-create profile on signup (role set later during onboarding)
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (user_id, display_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'role', 'parent')
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- 2. TEAMS TABLE
create table public.teams (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  sport text not null default 'Soccer',
  age_group text,
  organization text,
  emoji text default '⚽',
  created_at timestamptz default now() not null
);

alter table public.teams enable row level security;

create policy "Users can CRUD own teams"
  on public.teams for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);


-- 3. SEASONS TABLE
create table public.seasons (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  team_id uuid references public.teams(id) on delete cascade not null,
  name text not null,
  start_date date,
  end_date date,
  is_active boolean default true,
  created_at timestamptz default now() not null
);

alter table public.seasons enable row level security;

create policy "Users can CRUD own seasons"
  on public.seasons for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);


-- 4. PLAYERS TABLE (roster)
create table public.players (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  team_id uuid references public.teams(id) on delete cascade not null,
  name text not null,
  number integer,
  position text,
  photo_path text,
  is_my_child boolean default false,
  created_at timestamptz default now() not null
);

alter table public.players enable row level security;

create policy "Users can CRUD own players"
  on public.players for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);


-- 5. ENTRIES TABLE (the core - one line per game/practice/event)
create table public.entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  season_id uuid references public.seasons(id) on delete cascade not null,
  entry_date date not null,
  entry_type text not null default 'game' check (entry_type in ('game', 'practice', 'tournament', 'event')),
  
  -- The soul of the app: the memory
  text text not null check (char_length(text) <= 500),
  photo_path text,
  
  -- Optional structured game data
  opponent text,
  venue text,
  score_home integer,
  score_away integer,
  result text check (result in ('win', 'loss', 'draw', null)),
  
  -- Optional player focus (for parent/player tracking one kid)
  player_id uuid references public.players(id) on delete set null,
  
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

alter table public.entries enable row level security;

create policy "Users can CRUD own entries"
  on public.entries for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index entries_season_date_idx on public.entries(season_id, entry_date desc);
create index entries_user_date_idx on public.entries(user_id, entry_date desc);
create index entries_player_idx on public.entries(player_id, entry_date desc);


-- 6. ENTRY_PLAYERS (which players were involved in an entry - scorers, assists, etc.)
create table public.entry_players (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid references public.entries(id) on delete cascade not null,
  player_id uuid references public.players(id) on delete cascade not null,
  contribution text check (contribution in ('goal', 'assist', 'save', 'mvp', 'highlight', 'other')),
  note text,
  created_at timestamptz default now() not null
);

alter table public.entry_players enable row level security;

create policy "Users can CRUD own entry_players"
  on public.entry_players for all
  using (
    exists (
      select 1 from public.entries e
      where e.id = entry_id and e.user_id = auth.uid()
    )
  );


-- 7. STREAK FUNCTION
create or replace function public.get_season_stats(p_season_id uuid)
returns json as $$
declare
  result json;
begin
  select json_build_object(
    'total_entries', count(*),
    'games', count(*) filter (where entry_type = 'game'),
    'practices', count(*) filter (where entry_type = 'practice'),
    'wins', count(*) filter (where result = 'win'),
    'losses', count(*) filter (where result = 'loss'),
    'draws', count(*) filter (where result = 'draw'),
    'photos', count(*) filter (where photo_path is not null)
  ) into result
  from public.entries
  where season_id = p_season_id;
  
  return result;
end;
$$ language plpgsql security definer;


-- 8. STORAGE BUCKET FOR PHOTOS
insert into storage.buckets (id, name, public)
values ('sports-photos', 'sports-photos', true);

create policy "Users can upload own photos"
  on storage.objects for insert
  with check (
    bucket_id = 'sports-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Anyone can view photos"
  on storage.objects for select
  using (bucket_id = 'sports-photos');

create policy "Users can delete own photos"
  on storage.objects for delete
  using (
    bucket_id = 'sports-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );


-- ============================================
-- DONE! Your database is ready.
-- ============================================
