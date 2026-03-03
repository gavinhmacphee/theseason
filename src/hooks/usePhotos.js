import { useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'
import { resizeImage } from '../lib/utils'

export function usePhotos() {
  const { user } = useAuth()

  const uploadPhoto = useCallback(
    async (file) => {
      if (!user) throw new Error('Must be signed in')

      // Resize to max 1200px
      const resized = await resizeImage(file, 1200)

      const ext = 'jpg'
      const path = `${user.id}/${Date.now()}.${ext}`

      const { error } = await supabase.storage
        .from('entry-photos')
        .upload(path, resized, { contentType: 'image/jpeg' })

      if (error) throw error

      const { data: urlData } = supabase.storage
        .from('entry-photos')
        .getPublicUrl(path)

      return urlData.publicUrl
    },
    [user]
  )

  return { uploadPhoto }
}
