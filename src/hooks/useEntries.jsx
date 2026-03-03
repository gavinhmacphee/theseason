import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'
import { useSeasons } from './useSeasons'
import { useToast } from './useToast'

const EntriesContext = createContext(null)

export function EntriesProvider({ children }) {
  const { user } = useAuth()
  const { activeSeason } = useSeasons()
  const { showToast } = useToast()
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)

  const loadEntries = useCallback(async () => {
    if (!user || !activeSeason) {
      setEntries([])
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('entries')
        .select('*')
        .eq('season_id', activeSeason.id)
        .order('entry_date', { ascending: false })

      if (error) throw error
      setEntries(data || [])
    } catch (err) {
      console.error('Failed to load entries:', err)
      showToast('Failed to load entries', 'error')
    } finally {
      setLoading(false)
    }
  }, [user, activeSeason, showToast])

  useEffect(() => {
    loadEntries()
  }, [loadEntries])

  const createEntry = useCallback(
    async (entryData) => {
      if (!user || !activeSeason) throw new Error('Must have an active season')

      const { data, error } = await supabase
        .from('entries')
        .insert({
          ...entryData,
          season_id: activeSeason.id,
          user_id: user.id,
        })
        .select()

      if (error) throw error
      if (data && data.length > 0) {
        setEntries((prev) => [data[0], ...prev])
        return data[0]
      }
    },
    [user, activeSeason]
  )

  const updateEntry = useCallback(
    async (id, updates) => {
      const { data, error } = await supabase
        .from('entries')
        .update(updates)
        .eq('id', id)
        .select()

      if (error) throw error
      if (data && data.length > 0) {
        setEntries((prev) => prev.map((e) => (e.id === id ? data[0] : e)))
        return data[0]
      }
    },
    []
  )

  const deleteEntry = useCallback(
    async (id) => {
      const { error } = await supabase.from('entries').delete().eq('id', id)
      if (error) throw error
      setEntries((prev) => prev.filter((e) => e.id !== id))
    },
    []
  )

  return (
    <EntriesContext.Provider value={{ entries, loading, createEntry, updateEntry, deleteEntry, reload: loadEntries }}>
      {children}
    </EntriesContext.Provider>
  )
}

export function useEntries() {
  const ctx = useContext(EntriesContext)
  if (!ctx) throw new Error('useEntries must be used within EntriesProvider')
  return ctx
}
