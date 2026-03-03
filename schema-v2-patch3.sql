-- ============================================
-- PATCH 3: Add parent-direct team creation support
-- Paste into Supabase SQL Editor and run
-- ============================================

-- 1. Add created_by column to teams (for parent-created teams without orgs)
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id);

-- 2. Add is_my_child column to players
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS is_my_child boolean DEFAULT false;

-- 3. RLS policies for parent-created teams (no org required)

-- Teams: creators can read their own teams
DROP POLICY IF EXISTS "Team creators can read own teams" ON public.teams;
CREATE POLICY "Team creators can read own teams" ON public.teams
  FOR SELECT USING (auth.uid() = created_by);

-- Teams: users can create teams directly
DROP POLICY IF EXISTS "Users can create teams" ON public.teams;
CREATE POLICY "Users can create teams" ON public.teams
  FOR INSERT WITH CHECK (auth.uid() = created_by);

-- Teams: creators can update their own teams
DROP POLICY IF EXISTS "Team creators can update own teams" ON public.teams;
CREATE POLICY "Team creators can update own teams" ON public.teams
  FOR UPDATE USING (auth.uid() = created_by);

-- Players: team creators can read players on their teams
DROP POLICY IF EXISTS "Team creators can read players" ON public.players;
CREATE POLICY "Team creators can read players" ON public.players
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.teams t WHERE t.id = team_id AND t.created_by = auth.uid())
  );

-- Players: team creators can add players to their teams
DROP POLICY IF EXISTS "Team creators can insert players" ON public.players;
CREATE POLICY "Team creators can insert players" ON public.players
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.teams t WHERE t.id = team_id AND t.created_by = auth.uid())
  );

-- ✅ Done! Parent-direct team creation now works alongside org-based teams.
