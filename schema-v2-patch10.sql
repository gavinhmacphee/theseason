-- Patch 10: Add player stat columns for milestone tracking (goals, assists, clean_sheet)
-- Run this in Supabase SQL Editor

ALTER TABLE public.entries ADD COLUMN IF NOT EXISTS goals integer DEFAULT 0;
ALTER TABLE public.entries ADD COLUMN IF NOT EXISTS assists integer DEFAULT 0;
ALTER TABLE public.entries ADD COLUMN IF NOT EXISTS clean_sheet boolean DEFAULT false;
