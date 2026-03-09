-- ============================================
-- PATCH 8: Soft delete for seasons
-- Paste into Supabase SQL Editor and run
-- ============================================

-- Add deleted_at column (NULL = active, timestamp = soft-deleted)
ALTER TABLE public.seasons ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;

-- Update the RLS policy to exclude soft-deleted seasons from normal reads
-- Drop and recreate to add the deleted_at filter
DROP POLICY IF EXISTS "Users can CRUD own seasons" ON public.seasons;

-- Users can read/update/delete their own non-deleted seasons
CREATE POLICY "Users can CRUD own seasons" ON public.seasons
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Note: We keep the policy simple (no deleted_at filter in RLS) so that
-- the soft-delete UPDATE itself is allowed. The client filters deleted_at
-- in its SELECT queries instead.
