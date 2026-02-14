-- ============================================
-- TEAM SEASON v2 — Patch 1: Join Flow Functions
-- Run in Supabase SQL Editor (bcrmbujolevvzvontstt)
-- Adds RPC functions for parent join link flow
-- ============================================


-- 1. get_join_info: Public function (no auth needed)
-- Called before parent signs up to show branded landing page
-- Returns player/team/org info for a join token
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


-- 2. claim_connection: Authenticated function
-- Called after parent signs in/up to claim the connection
-- Sets user_id and connected_at on the player_connection
-- Creates a season for the parent linked to the team
-- Returns all data needed to set up the parent's journal
create or replace function public.claim_connection(p_token text)
returns json as $$
declare
  v_conn record;
  v_season_id uuid;
begin
  -- Find the unclaimed connection
  select pc.id as conn_id, pc.player_id,
         p.name as player_name, p.number as player_number, p.team_id,
         t.name as team_name, t.sport, t.emoji, t.color as team_color,
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

  -- Claim the connection
  update public.player_connections
  set user_id = auth.uid(), connected_at = now()
  where id = v_conn.conn_id;

  -- Create a season for the parent on this team
  v_season_id := gen_random_uuid();
  insert into public.seasons (id, user_id, team_id, name, is_active)
  values (
    v_season_id,
    auth.uid(),
    v_conn.team_id,
    v_conn.team_name || ' ' || extract(year from now())::text,
    true
  );

  return json_build_object(
    'success', true,
    'player_id', v_conn.player_id,
    'player_name', v_conn.player_name,
    'player_number', v_conn.player_number,
    'team_id', v_conn.team_id,
    'team_name', v_conn.team_name,
    'team_sport', v_conn.sport,
    'team_emoji', v_conn.emoji,
    'team_color', coalesce(v_conn.org_color, v_conn.team_color, '#1B4332'),
    'season_id', v_season_id,
    'season_name', v_conn.team_name || ' ' || extract(year from now())::text
  );
end;
$$ language plpgsql security definer;
