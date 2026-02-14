-- ============================================
-- TEAM SEASON v2 — Full Schema
-- Run in Supabase SQL Editor (bcrmbujolevvzvontstt)
-- Drops empty v1 tables and creates everything fresh
-- ============================================


-- ==========================================
-- CLEAN UP: Drop empty v1 tables
-- (profiles and entries exist with wrong schemas, 0 rows)
-- ==========================================
drop table if exists public.entry_players cascade;
drop table if exists public.entries cascade;
drop table if exists public.players cascade;
drop table if exists public.seasons cascade;
drop table if exists public.teams cascade;
drop table if exists public.player_connections cascade;
drop table if exists public.org_members cascade;
drop table if exists public.organizations cascade;
drop table if exists public.profiles cascade;

-- Drop old trigger if exists
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();
drop function if exists public.get_season_stats(uuid);
drop function if exists public.is_org_member(uuid);
drop function if exists public.is_org_admin(uuid);


-- ==========================================
-- HELPER FUNCTIONS (security definer to avoid RLS loops)
-- ==========================================

-- Check if user is a member of an org (any role)
create function public.is_org_member(p_org_id uuid)
returns boolean as $$
begin
  return exists (
    select 1 from public.org_members
    where org_id = p_org_id and user_id = auth.uid()
  );
end;
$$ language plpgsql security definer stable;

-- Check if user is an admin of an org
create function public.is_org_admin(p_org_id uuid)
returns boolean as $$
begin
  return exists (
    select 1 from public.org_members
    where org_id = p_org_id and user_id = auth.uid() and role = 'admin'
  );
end;
$$ language plpgsql security definer stable;


-- ==========================================
-- 1. PROFILES
-- ==========================================
create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null unique,
  display_name text,
  avatar_url text,
  role text not null default 'parent' check (role in ('coach', 'parent', 'player')),
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

-- Auto-create profile on signup
create function public.handle_new_user()
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


-- ==========================================
-- 2. ORGANIZATIONS
-- ==========================================
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  org_type text not null default 'club' check (org_type in ('club', 'school', 'other')),
  logo_url text,
  color text default '#1B4332',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now() not null
);

alter table public.organizations enable row level security;

-- Anyone can read orgs (needed for join link landing pages)
create policy "Anyone can read orgs"
  on public.organizations for select
  using (true);

-- Only org admins can update their org
create policy "Org admins can update org"
  on public.organizations for update
  using (public.is_org_admin(id));

-- Authenticated users can create orgs
create policy "Authenticated users can create orgs"
  on public.organizations for insert
  with check (auth.uid() is not null);


-- ==========================================
-- 3. ORG MEMBERS
-- ==========================================
create table public.org_members (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  role text not null default 'viewer' check (role in ('admin', 'staff', 'viewer')),
  created_at timestamptz default now() not null,
  unique(org_id, user_id)
);

alter table public.org_members enable row level security;

-- Members can read their own memberships
create policy "Users can read own memberships"
  on public.org_members for select
  using (auth.uid() = user_id);

-- Org admins can read all members in their org
create policy "Org admins can read org members"
  on public.org_members for select
  using (public.is_org_admin(org_id));

-- Org admins can manage members
create policy "Org admins can insert members"
  on public.org_members for insert
  with check (public.is_org_admin(org_id));

create policy "Org admins can update members"
  on public.org_members for update
  using (public.is_org_admin(org_id));

create policy "Org admins can delete members"
  on public.org_members for delete
  using (public.is_org_admin(org_id));

-- Auto-add creator as admin when org is created
create function public.handle_new_org()
returns trigger as $$
begin
  insert into public.org_members (org_id, user_id, role)
  values (new.id, new.created_by, 'admin');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_org_created
  after insert on public.organizations
  for each row execute function public.handle_new_org();


-- ==========================================
-- 4. TEAMS (with optional org link)
-- ==========================================
create table public.teams (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  org_id uuid references public.organizations(id) on delete set null,
  name text not null,
  sport text not null default 'Soccer',
  age_group text,
  emoji text default '⚽',
  color text default '#1B4332',
  created_at timestamptz default now() not null
);

alter table public.teams enable row level security;

-- Users can manage their own teams
create policy "Users can CRUD own teams"
  on public.teams for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Org members can read teams in their org
create policy "Org members can read org teams"
  on public.teams for select
  using (org_id is not null and public.is_org_member(org_id));


-- ==========================================
-- 5. SEASONS
-- ==========================================
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


-- ==========================================
-- 6. PLAYERS (roster)
-- ==========================================
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


-- ==========================================
-- 7. PLAYER CONNECTIONS (parent-to-player link)
-- ==========================================
create table public.player_connections (
  id uuid primary key default gen_random_uuid(),
  player_id uuid references public.players(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade,
  role text not null default 'primary' check (role in ('primary', 'contributor')),
  join_token text unique not null default encode(gen_random_bytes(16), 'hex'),
  connected_at timestamptz,
  created_at timestamptz default now() not null
);

alter table public.player_connections enable row level security;

-- Anyone can read connections by token (needed for join flow before auth)
create policy "Public read by token"
  on public.player_connections for select
  using (true);

-- Team owner can create connections (generates join links)
create policy "Team owner can create connections"
  on public.player_connections for insert
  with check (
    exists (
      select 1 from public.players p
      join public.teams t on t.id = p.team_id
      where p.id = player_id and t.user_id = auth.uid()
    )
  );

-- Users can claim a connection (update user_id + connected_at)
create policy "Users can claim connections"
  on public.player_connections for update
  using (
    -- Either the team owner or the user being connected
    auth.uid() = user_id
    or exists (
      select 1 from public.players p
      join public.teams t on t.id = p.team_id
      where p.id = player_id and t.user_id = auth.uid()
    )
  );

-- Now that player_connections exists, add the cross-reference policy on players
create policy "Connected parents can read players"
  on public.players for select
  using (
    exists (
      select 1 from public.player_connections pc
      where pc.player_id = id and pc.user_id = auth.uid() and pc.connected_at is not null
    )
  );


-- ==========================================
-- 8. ENTRIES (the journal - one per game/practice/event)
-- ==========================================
create table public.entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  season_id uuid references public.seasons(id) on delete cascade not null,
  entry_date date not null,
  entry_type text not null default 'game' check (entry_type in ('game', 'practice', 'tournament', 'event')),

  -- The memory
  text text not null check (char_length(text) <= 500),
  photo_path text,

  -- Structured game data
  opponent text,
  venue text,
  score_home integer,
  score_away integer,
  result text check (result in ('win', 'loss', 'draw', null)),

  -- Player focus
  player_id uuid references public.players(id) on delete set null,

  -- Org content sharing consent
  consent_shared boolean default false,

  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

alter table public.entries enable row level security;

create policy "Users can CRUD own entries"
  on public.entries for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Org members can read consented entries from their org's teams
create policy "Org members can read consented entries"
  on public.entries for select
  using (
    consent_shared = true
    and exists (
      select 1 from public.seasons s
      join public.teams t on t.id = s.team_id
      where s.id = season_id
        and t.org_id is not null
        and public.is_org_member(t.org_id)
    )
  );


-- ==========================================
-- 9. ENTRY PLAYERS (contributions per entry)
-- ==========================================
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


-- ==========================================
-- 10. INDEXES
-- ==========================================
create index entries_season_date_idx on public.entries(season_id, entry_date desc);
create index entries_user_date_idx on public.entries(user_id, entry_date desc);
create index entries_player_idx on public.entries(player_id, entry_date desc);
create index entries_consent_idx on public.entries(consent_shared) where consent_shared = true;
create index teams_org_idx on public.teams(org_id) where org_id is not null;
create index org_members_org_idx on public.org_members(org_id);
create index org_members_user_idx on public.org_members(user_id);
create index player_connections_token_idx on public.player_connections(join_token);
create index player_connections_player_idx on public.player_connections(player_id);
create index seasons_team_idx on public.seasons(team_id);
create index players_team_idx on public.players(team_id);


-- ==========================================
-- 11. SEASON STATS FUNCTION
-- ==========================================
create function public.get_season_stats(p_season_id uuid)
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


-- ==========================================
-- 12. STORAGE BUCKET
-- ==========================================
insert into storage.buckets (id, name, public)
values ('sports-photos', 'sports-photos', true)
on conflict (id) do nothing;

drop policy if exists "Users can upload own photos" on storage.objects;
create policy "Users can upload own photos"
  on storage.objects for insert
  with check (
    bucket_id = 'sports-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Anyone can view photos" on storage.objects;
create policy "Anyone can view photos"
  on storage.objects for select
  using (bucket_id = 'sports-photos');

drop policy if exists "Users can delete own photos" on storage.objects;
create policy "Users can delete own photos"
  on storage.objects for delete
  using (
    bucket_id = 'sports-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );


-- ==========================================
-- DONE
-- Tables: profiles, organizations, org_members, teams,
--         seasons, players, player_connections, entries,
--         entry_players
-- ==========================================
