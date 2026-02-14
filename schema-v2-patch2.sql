-- ============================================
-- TEAM SEASON v2 — Patch 2: Approval + Org Feed
-- Run in Supabase SQL Editor (bcrmbujolevvzvontstt)
-- Adds approval column and feed functions
-- ============================================


-- 1. Add approved column to entries
alter table public.entries
  add column if not exists approved boolean default null;

-- Index for quick feed queries (consent + pending approval)
create index if not exists entries_approval_idx
  on public.entries(consent_shared, approved)
  where consent_shared = true;


-- 2. approve_entry: Org admin approves or rejects an entry
-- Security definer so admin can update entries they don't own
create or replace function public.approve_entry(p_entry_id uuid, p_approved boolean)
returns json as $$
declare
  v_entry record;
begin
  -- Verify the entry exists, is consented, and belongs to this admin's org
  select e.id into v_entry
  from public.entries e
  join public.seasons s on s.id = e.season_id
  join public.teams t on t.id = s.team_id
  where e.id = p_entry_id
    and e.consent_shared = true
    and t.org_id is not null
    and public.is_org_admin(t.org_id);

  if not found then
    return json_build_object('error', 'Entry not found or unauthorized');
  end if;

  update public.entries
  set approved = p_approved, updated_at = now()
  where id = p_entry_id;

  return json_build_object('success', true);
end;
$$ language plpgsql security definer;


-- 3. get_org_feed: Returns consented entries for an org's teams
-- Includes player name, team name, and approval status
create or replace function public.get_org_feed(p_org_id uuid, p_status text default 'all')
returns json as $$
declare
  v_result json;
begin
  -- Verify caller is org member
  if not public.is_org_member(p_org_id) then
    return json_build_object('error', 'Unauthorized');
  end if;

  select coalesce(json_agg(row_to_json(r) order by r.entry_date desc), '[]'::json)
  into v_result
  from (
    select
      e.id,
      e.entry_date,
      e.entry_type,
      e.text,
      e.opponent,
      e.venue,
      e.score_home,
      e.score_away,
      e.result,
      e.photo_path,
      e.approved,
      e.created_at,
      p2.name as player_name,
      p2.number as player_number,
      t.name as team_name,
      t.age_group as team_age_group,
      pr.display_name as author_name
    from public.entries e
    join public.seasons s on s.id = e.season_id
    join public.teams t on t.id = s.team_id
    left join public.players p2 on p2.id = e.player_id
    left join public.profiles pr on pr.user_id = e.user_id
    where e.consent_shared = true
      and t.org_id = p_org_id
      and (
        p_status = 'all'
        or (p_status = 'pending' and e.approved is null)
        or (p_status = 'approved' and e.approved = true)
        or (p_status = 'rejected' and e.approved = false)
      )
  ) r;

  return v_result;
end;
$$ language plpgsql security definer;


-- 4. Update claim_connection to also return org info
-- (Re-create to include org_id and org_name in response)
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

  update public.player_connections
  set user_id = auth.uid(), connected_at = now()
  where id = v_conn.conn_id;

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
    'org_id', v_conn.org_id,
    'org_name', v_conn.org_name,
    'season_id', v_season_id,
    'season_name', v_conn.team_name || ' ' || extract(year from now())::text
  );
end;
$$ language plpgsql security definer;
