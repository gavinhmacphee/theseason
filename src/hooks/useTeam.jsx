import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'
import { useToast } from './useToast'
import { generateId } from '../lib/utils'
import { SPORTS } from '../lib/constants'

const TeamContext = createContext(null)

export function TeamProvider({ children }) {
  const { user } = useAuth()
  const { showToast } = useToast()
  const [team, setTeam] = useState(null)
  const [players, setPlayers] = useState([])
  const [loading, setLoading] = useState(true)

  // Load team for current user
  const loadTeam = useCallback(async () => {
    if (!user) {
      setTeam(null)
      setPlayers([])
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      // Check self-created teams first
      const { data: teams, error: teamErr } = await supabase
        .from('teams')
        .select('*')
        .eq('created_by', user.id)
        .limit(1)

      if (teamErr) throw teamErr

      if (teams && teams.length > 0) {
        const t = teams[0]
        const sportObj = SPORTS.find((s) => s.name === t.sport)
        setTeam({ ...t, emoji: sportObj?.emoji || t.emoji })

        const { data: p, error: pErr } = await supabase
          .from('players')
          .select('*')
          .eq('team_id', t.id)

        if (pErr) throw pErr
        setPlayers(p || [])
      } else {
        // Check join-flow teams (season owned by user, team owned by admin)
        const { data: seasons, error: sErr } = await supabase
          .from('seasons')
          .select('team_id')
          .eq('user_id', user.id)
          .limit(1)

        if (!sErr && seasons?.length > 0) {
          const { data: joinTeams, error: jtErr } = await supabase
            .from('teams')
            .select('*')
            .eq('id', seasons[0].team_id)
            .limit(1)

          if (!jtErr && joinTeams?.length > 0) {
            const t = joinTeams[0]
            const sportObj = SPORTS.find((s) => s.name === t.sport)
            setTeam({ ...t, emoji: sportObj?.emoji || t.emoji })

            const { data: p } = await supabase
              .from('players')
              .select('*')
              .eq('team_id', t.id)
            setPlayers(p || [])
          }
        }
      }
    } catch (err) {
      console.error('Failed to load team:', err)
      showToast('Failed to load team data', 'error')
    } finally {
      setLoading(false)
    }
  }, [user, showToast])

  useEffect(() => {
    loadTeam()
  }, [loadTeam])

  const createTeam = useCallback(
    async ({ name, sport, color, playerName }) => {
      if (!user) throw new Error('Must be signed in')

      const sportObj = SPORTS.find((s) => s.name === sport)
      const teamId = generateId()
      const playerId = generateId()

      const { error: teamErr } = await supabase.from('teams').insert({
        id: teamId,
        name,
        sport,
        emoji: sportObj?.emoji || '',
        color: color || '#1B4332',
        created_by: user.id,
      })

      if (teamErr) throw teamErr

      const { error: playerErr } = await supabase.from('players').insert({
        id: playerId,
        name: playerName || 'Player',
        team_id: teamId,
        is_my_child: true,
      })

      if (playerErr) throw playerErr

      const newTeam = {
        id: teamId,
        name,
        sport,
        emoji: sportObj?.emoji || '',
        color: color || '#1B4332',
        created_by: user.id,
      }

      setTeam(newTeam)
      setPlayers([{ id: playerId, name: playerName || 'Player', team_id: teamId, is_my_child: true }])

      return { teamId, playerId }
    },
    [user]
  )

  return (
    <TeamContext.Provider value={{ team, players, loading, createTeam, reload: loadTeam }}>
      {children}
    </TeamContext.Provider>
  )
}

export function useTeam() {
  const ctx = useContext(TeamContext)
  if (!ctx) throw new Error('useTeam must be used within TeamProvider')
  return ctx
}
