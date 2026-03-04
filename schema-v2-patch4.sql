-- ============================================
-- PATCH 4: Fix column name + entry type constraint
-- Paste into Supabase SQL Editor and run
-- ============================================

-- 1. Rename photo_path to photo_url (matches what the app writes)
ALTER TABLE public.entries RENAME COLUMN photo_path TO photo_url;

-- 2. Drop old CHECK constraint and add new one with all 7 entry types
ALTER TABLE public.entries DROP CONSTRAINT IF EXISTS entries_entry_type_check;
ALTER TABLE public.entries ADD CONSTRAINT entries_entry_type_check
  CHECK (entry_type IN ('game', 'practice', 'tournament', 'event', 'sightseeing', 'food', 'moment'));

-- ✅ Done! Entry inserts with photo_url and all entry types now work.
