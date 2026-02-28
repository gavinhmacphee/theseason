-- ============================================
-- TEAM SEASON — Clean Reset
-- Paste this ENTIRE block into Supabase SQL Editor
-- (Dashboard > SQL Editor > New Query > Paste > Run)
-- This wipes orphaned data and re-runs everything fresh
-- ============================================

-- Step 1: Drop everything
drop table if exists public.entry_players cascade;
drop table if exists public.entries cascade;
drop table if exists public.players cascade;
drop table if exists public.seasons cascade;
drop table if exists public.teams cascade;
drop table if exists public.player_connections cascade;
drop table if exists public.org_members cascade;
drop table if exists public.organizations cascade;
drop table if exists public.profiles cascade;

drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();
drop function if exists public.get_season_stats(uuid);
drop function if exists public.is_org_member(uuid);
drop function if exists public.is_org_admin(uuid);
drop function if exists public.get_join_info(text);
drop function if exists public.claim_connection(text);
drop function if exists public.approve_entry(uuid, boolean);
drop function if exists public.get_org_feed(uuid, text);


-- Step 2: Helper functions
create function public.is_org_member(p_org_id uuid)
returns boolean as $$
begin
  return exists (
    select 1 from public.org_members
    where org_id = p_org_id and user_id = auth.uid()
  );
end;
$$ language plpgsql security definer stable;

create function public.is_org_admin(p_org_id uuid)
returns boolean as $$
begin
  return exists (
    select 1 from public.org_members
    where org_id = p_org_id and user_id = auth.uid() and role = 'admin'
  );
end;
$$ language plpgsql security definer stable;


-- Step 3: Tables
create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null unique,
  display_name text,
  avatar_url text,
  role text not null default 'parent' check (role in ('coach', 'parent', 'player')),
  created_at timestamptz default now() not null
);
alter table public.profiles enable row level security;
create policy "Users can read own profile" on public.profiles for select using (auth.uid() = user_id);
create policy "Users can update own profile" on public.profiles for update using (auth.uid() = user_id);
create policy "Users can insert own profile" on public.profiles for insert with check (auth.uid() = user_id);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  org_type text default 'club' check (org_type in ('club', 'league', 'school', 'rec')),
  color text default '#1B4332',
  logo_url text,
  created_by uuid references auth.users(id),
  created_at timestamptz default now() not null
);
alter table public.organizations enable row level security;
create policy "Org members can read org" on public.organizations for select using (public.is_org_member(id));
create policy "Anyone can create org" on public.organizations for insert with check (auth.uid() = created_by);
create policy "Org admins can update" on public.organizations for update using (public.is_org_admin(id));

create table public.org_members (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  role text not null default 'viewer' check (role in ('admin', 'staff', 'viewer')),
  created_at timestamptz default now() not null,
  unique(org_id, user_id)
);
alter table public.org_members enable row level security;
create policy "Members can read own org members" on public.org_members for select using (public.is_org_member(org_id));
create policy "Admins can insert members" on public.org_members for insert with check (public.is_org_admin(org_id) or auth.uid() = user_id);
create policy "Admins can update members" on public.org_members for update using (public.is_org_admin(org_id));
create policy "Admins can delete members" on public.org_members for delete using (public.is_org_admin(org_id));

-- Auto-add org creator as admin
create or replace function public.handle_new_org()
returns trigger as $$
begin
  insert into public.org_members (org_id, user_id, role)
  values (NEW.id, NEW.created_by, 'admin');
  return NEW;
end;
$$ language plpgsql security definer;
create trigger on_org_created after insert on public.organizations
  for each row execute function public.handle_new_org();

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete cascade,
  name text not null,
  sport text default 'soccer',
  emoji text default '⚽',
  color text default '#1B4332',
  age_group text,
  created_at timestamptz default now() not null
);
alter table public.teams enable row level security;
create policy "Org members can read teams" on public.teams for select using (public.is_org_member(org_id));
create policy "Org admins can insert teams" on public.teams for insert with check (public.is_org_admin(org_id));
create policy "Org admins can update teams" on public.teams for update using (public.is_org_admin(org_id));
create policy "Org admins can delete teams" on public.teams for delete using (public.is_org_admin(org_id));

create table public.players (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references public.teams(id) on delete cascade not null,
  name text not null,
  number text,
  created_at timestamptz default now() not null
);
alter table public.players enable row level security;
create policy "Org members can read players" on public.players for select using (
  exists (select 1 from public.teams t where t.id = team_id and public.is_org_member(t.org_id))
);
create policy "Org admins can insert players" on public.players for insert with check (
  exists (select 1 from public.teams t where t.id = team_id and public.is_org_admin(t.org_id))
);
create policy "Connected parents can read their player" on public.players for select using (
  exists (select 1 from public.player_connections pc where pc.player_id = id and pc.user_id = auth.uid())
);

create table public.player_connections (
  id uuid primary key default gen_random_uuid(),
  player_id uuid references public.players(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete set null,
  join_token text not null unique default encode(gen_random_bytes(16), 'hex'),
  connected_at timestamptz,
  created_at timestamptz default now() not null
);
alter table public.player_connections enable row level security;
create policy "Org members can read connections" on public.player_connections for select using (
  exists (
    select 1 from public.players p join public.teams t on t.id = p.team_id
    where p.id = player_id and public.is_org_member(t.org_id)
  )
);
create policy "Org admins can insert connections" on public.player_connections for insert with check (
  exists (
    select 1 from public.players p join public.teams t on t.id = p.team_id
    where p.id = player_id and public.is_org_admin(t.org_id)
  )
);
create policy "Connected users can read own connection" on public.player_connections for select using (auth.uid() = user_id);

create table public.seasons (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  team_id uuid references public.teams(id) on delete set null,
  name text not null,
  is_active boolean default true,
  created_at timestamptz default now() not null
);
alter table public.seasons enable row level security;
create policy "Users can read own seasons" on public.seasons for select using (auth.uid() = user_id);
create policy "Users can insert own seasons" on public.seasons for insert with check (auth.uid() = user_id);
create policy "Users can update own seasons" on public.seasons for update using (auth.uid() = user_id);

create table public.entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  season_id uuid references public.seasons(id) on delete cascade not null,
  player_id uuid references public.players(id) on delete set null,
  entry_type text not null default 'game' check (entry_type in ('game', 'practice', 'event', 'sightseeing', 'food')),
  entry_date date not null default current_date,
  text text,
  opponent text,
  venue text,
  score_home integer,
  score_away integer,
  result text check (result in ('win', 'loss', 'draw', null)),
  photo_path text,
  consent_shared boolean default false,
  approved boolean default null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);
alter table public.entries enable row level security;
create policy "Users can read own entries" on public.entries for select using (auth.uid() = user_id);
create policy "Users can insert own entries" on public.entries for insert with check (auth.uid() = user_id);
create policy "Users can update own entries" on public.entries for update using (auth.uid() = user_id);
create policy "Users can delete own entries" on public.entries for delete using (auth.uid() = user_id);
create policy "Org members can read consented entries" on public.entries for select using (
  consent_shared = true and exists (
    select 1 from public.seasons s join public.teams t on t.id = s.team_id
    where s.id = season_id and t.org_id is not null and public.is_org_member(t.org_id)
  )
);

create index if not exists entries_approval_idx on public.entries(consent_shared, approved) where consent_shared = true;

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (user_id, display_name)
  values (NEW.id, coalesce(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)));
  return NEW;
end;
$$ language plpgsql security definer;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();


-- Step 4: RPC functions (from patches)

-- get_join_info (public, no auth needed)
create or replace function public.get_join_info(p_token text)
returns json as $$
declare
  v_result json;
begin
  select json_build_object(
    'player_name', p.name,
    'player_number', p.number,
    'player_id', p.id,
    'team_name', t.name,
    'team_id', t.id,
    'team_color', t.color,
    'team_sport', t.sport,
    'team_emoji', t.emoji,
    'team_age_group', t.age_group,
    'org_name', o.name,
    'org_color', o.color,
    'org_logo', o.logo_url,
    'org_type', o.org_type,
    'already_claimed', pc.user_id is not null
  ) into v_result
  from public.player_connections pc
  join public.players p on p.id = pc.player_id
  join public.teams t on t.id = p.team_id
  left join public.organizations o on o.id = t.org_id
  where pc.join_token = p_token;
  return coalesce(v_result, json_build_object('error', 'Invalid token'));
end;
$$ language plpgsql security definer;

-- claim_connection (authenticated)
create or replace function public.claim_connection(p_token text)
returns json as $$
declare
  v_conn record;
  v_season_id uuid;
begin
  select pc.id as conn_id, pc.player_id,
         p.name as player_name, p.number as player_number, p.team_id,
         t.name as team_name, t.sport, t.emoji, t.color as team_color,
         t.org_id,
         o.name as org_name, o.color as org_color
  into v_conn
  from public.player_connections pc
  join public.players p on p.id = pc.player_id
  join public.teams t on t.id = p.team_id
  left join public.organizations o on o.id = t.org_id
  where pc.join_token = p_token and pc.user_id is null;
  if not found then
    return json_build_object('error', 'Invalid or already claimed token');
  end if;
  update public.player_connections set user_id = auth.uid(), connected_at = now() where id = v_conn.conn_id;
  v_season_id := gen_random_uuid();
  insert into public.seasons (id, user_id, team_id, name, is_active)
  values (v_season_id, auth.uid(), v_conn.team_id, v_conn.team_name || ' ' || extract(year from now())::text, true);
  return json_build_object(
    'success', true, 'player_id', v_conn.player_id, 'player_name', v_conn.player_name,
    'player_number', v_conn.player_number, 'team_id', v_conn.team_id, 'team_name', v_conn.team_name,
    'team_sport', v_conn.sport, 'team_emoji', v_conn.emoji,
    'team_color', coalesce(v_conn.org_color, v_conn.team_color, '#1B4332'),
    'org_id', v_conn.org_id, 'org_name', v_conn.org_name,
    'season_id', v_season_id,
    'season_name', v_conn.team_name || ' ' || extract(year from now())::text
  );
end;
$$ language plpgsql security definer;

-- approve_entry (org admin)
create or replace function public.approve_entry(p_entry_id uuid, p_approved boolean)
returns json as $$
declare
  v_entry record;
begin
  select e.id into v_entry
  from public.entries e
  join public.seasons s on s.id = e.season_id
  join public.teams t on t.id = s.team_id
  where e.id = p_entry_id and e.consent_shared = true
    and t.org_id is not null and public.is_org_admin(t.org_id);
  if not found then
    return json_build_object('error', 'Entry not found or unauthorized');
  end if;
  update public.entries set approved = p_approved, updated_at = now() where id = p_entry_id;
  return json_build_object('success', true);
end;
$$ language plpgsql security definer;

-- get_org_feed (org member)
create or replace function public.get_org_feed(p_org_id uuid, p_status text default 'all')
returns json as $$
declare
  v_result json;
begin
  if not public.is_org_member(p_org_id) then
    return json_build_object('error', 'Unauthorized');
  end if;
  select coalesce(json_agg(row_to_json(r) order by r.entry_date desc), '[]'::json)
  into v_result
  from (
    select e.id, e.entry_date, e.entry_type, e.text, e.opponent, e.venue,
      e.score_home, e.score_away, e.result, e.photo_path, e.approved, e.created_at,
      p2.name as player_name, p2.number as player_number,
      t.name as team_name, t.age_group as team_age_group,
      pr.display_name as author_name
    from public.entries e
    join public.seasons s on s.id = e.season_id
    join public.teams t on t.id = s.team_id
    left join public.players p2 on p2.id = e.player_id
    left join public.profiles pr on pr.user_id = e.user_id
    where e.consent_shared = true and t.org_id = p_org_id
      and (p_status = 'all'
        or (p_status = 'pending' and e.approved is null)
        or (p_status = 'approved' and e.approved = true)
        or (p_status = 'rejected' and e.approved = false))
  ) r;
  return v_result;
end;
$$ language plpgsql security definer;


-- ✅ Done! Database is clean and ready.
