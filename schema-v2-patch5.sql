-- ============================================
-- PATCH 5: Storage bucket permissions for photo uploads
-- Paste into Supabase SQL Editor and run
-- ============================================

-- 1. Make the entry-photos bucket public (so photos are viewable)
UPDATE storage.buckets SET public = true WHERE id = 'entry-photos';

-- 2. Allow authenticated users to upload photos
CREATE POLICY "Authenticated users can upload photos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'entry-photos');

-- 3. Allow anyone to view/download photos
CREATE POLICY "Anyone can view photos"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'entry-photos');

-- 4. Allow users to update/overwrite their own photos
CREATE POLICY "Users can update own photos"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'entry-photos');

-- Done! Photo uploads should now work.
