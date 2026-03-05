-- Patch 7: Fix infinite RLS recursion between players and player_connections
-- The bug: players SELECT policy "Connected parents can read their player" queries player_connections,
-- and player_connections SELECT policy "Org members can read connections" queries back into players.
-- This causes infinite recursion on ANY select from the players table.

-- Fix: Replace the player_connections "Org members can read connections" policy
-- to join directly from player_connections → teams (via a security definer function)
-- instead of going through players (which has RLS that loops back).

-- Step 1: Create a helper function that bypasses RLS to get team_id from player_id
create or replace function public.get_team_id_for_player(p_player_id uuid)
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select team_id from public.players where id = p_player_id limit 1;
$$;

-- Step 2: Drop the recursive policy on player_connections
drop policy if exists "Org members can read connections" on public.player_connections;

-- Step 3: Recreate it using the security definer function (no RLS on players triggered)
create policy "Org members can read connections" on public.player_connections for select using (
  exists (
    select 1 from public.teams t
    where t.id = public.get_team_id_for_player(player_id)
    and public.is_org_member(t.org_id)
  )
);

-- Step 4: Also fix the insert policy on player_connections (same issue)
drop policy if exists "Org admins can insert connections" on public.player_connections;
create policy "Org admins can insert connections" on public.player_connections for insert with check (
  exists (
    select 1 from public.teams t
    where t.id = public.get_team_id_for_player(player_id)
    and public.is_org_admin(t.org_id)
  )
);
