import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'
import { useTeam } from './useTeam'
import { useToast } from './useToast'
import { generateId } from '../lib/utils'

const SeasonsContext = createContext(null)

export function SeasonsProvider({ children }) {
  const { user } = useAuth()
  const { team } = useTeam()
  const { showToast } = useToast()
  const [seasons, setSeasons] = useState([])
  const [activeSeason, setActiveSeason] = useState(null)
  const [loading, setLoading] = useState(true)

  const loadSeasons = useCallback(async () => {
    if (!user || !team) {
      setSeasons([])
      setActiveSeason(null)
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('seasons')
        .select('*')
        .eq('team_id', team.id)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      if (error) throw error

      setSeasons(data || [])
      if (data && data.length > 0) {
        // Default to most recent season
        setActiveSeason((prev) => {
          if (prev && data.find((s) => s.id === prev.id)) return prev
          return data[0]
        })
      }
    } catch (err) {
      console.error('Failed to load seasons:', err)
      showToast('Failed to load seasons', 'error')
    } finally {
      setLoading(false)
    }
  }, [user, team, showToast])

  useEffect(() => {
    loadSeasons()
  }, [loadSeasons])

  const createSeason = useCallback(
    async (name) => {
      if (!user || !team) throw new Error('Must have a team first')

      const seasonId = generateId()
      const { error } = await supabase.from('seasons').insert({
        id: seasonId,
        name,
        team_id: team.id,
        user_id: user.id,
      })

      if (error) throw error

      const newSeason = {
        id: seasonId,
        name,
        team_id: team.id,
        user_id: user.id,
        created_at: new Date().toISOString(),
      }

      setSeasons((prev) => [newSeason, ...prev])
      setActiveSeason(newSeason)
      return newSeason
    },
    [user, team]
  )

  const switchSeason = useCallback(
    (seasonId) => {
      const s = seasons.find((s) => s.id === seasonId)
      if (s) setActiveSeason(s)
    },
    [seasons]
  )

  return (
    <SeasonsContext.Provider value={{ seasons, activeSeason, loading, createSeason, switchSeason, reload: loadSeasons }}>
      {children}
    </SeasonsContext.Provider>
  )
}

export function useSeasons() {
  const ctx = useContext(SeasonsContext)
  if (!ctx) throw new Error('useSeasons must be used within SeasonsProvider')
  return ctx
}
