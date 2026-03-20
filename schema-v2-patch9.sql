-- Patch 9: Add coach entry types (film, player, week) to entry_type CHECK constraint
-- Run this in Supabase SQL Editor

ALTER TABLE public.entries DROP CONSTRAINT IF EXISTS entries_entry_type_check;
ALTER TABLE public.entries ADD CONSTRAINT entries_entry_type_check
  CHECK (entry_type IN ('game', 'practice', 'tournament', 'event', 'sightseeing', 'food', 'moment', 'film', 'player', 'week'));
