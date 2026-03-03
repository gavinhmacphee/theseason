import { useState, useRef, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useTeam } from '../hooks/useTeam'
import { useSeasons } from '../hooks/useSeasons'
import { useEntries } from '../hooks/useEntries'
import { useToast } from '../hooks/useToast'
import AppShell from '../components/ui/AppShell'
import EntryFeed from '../components/journal/EntryFeed'
import EntryComposer from '../components/journal/EntryComposer'

export default function HomePage() {
  const { signOut } = useAuth()
  const { team } = useTeam()
  const { seasons, activeSeason, switchSeason, createSeason } = useSeasons()
  const { entries } = useEntries()
  const { showToast } = useToast()
  const [showComposer, setShowComposer] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [showSeasonPicker, setShowSeasonPicker] = useState(false)
  const [newSeasonName, setNewSeasonName] = useState('')
  const [creatingSeason, setCreatingSeason] = useState(false)
  const menuRef = useRef(null)
  const seasonRef = useRef(null)

  // Close hamburger menu on outside click
  useEffect(() => {
    if (!showMenu) return
    const handleClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setShowMenu(false)
      }
    }
    const timer = setTimeout(() => document.addEventListener('click', handleClick), 0)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('click', handleClick)
    }
  }, [showMenu])

  // Close season picker on outside click
  useEffect(() => {
    if (!showSeasonPicker) return
    const handleClick = (e) => {
      if (seasonRef.current && !seasonRef.current.contains(e.target)) {
        setShowSeasonPicker(false)
        setNewSeasonName('')
      }
    }
    const timer = setTimeout(() => document.addEventListener('click', handleClick), 0)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('click', handleClick)
    }
  }, [showSeasonPicker])

  const handleSignOut = async () => {
    try {
      await signOut()
    } catch (err) {
      console.error('Sign out failed:', err)
    }
  }

  const handleSwitchSeason = (id) => {
    switchSeason(id)
    setShowSeasonPicker(false)
  }

  const handleCreateSeason = async () => {
    const name = newSeasonName.trim()
    if (!name || creatingSeason) return
    setCreatingSeason(true)
    try {
      await createSeason(name)
      showToast('Season created!', 'success')
      setNewSeasonName('')
      setShowSeasonPicker(false)
    } catch (err) {
      showToast('Failed to create season', 'error')
    }
    setCreatingSeason(false)
  }

  const brandColor = team?.color || '#1B4332'

  const seasonPicker = (
    <div className="relative" ref={seasonRef}>
      <button
        onClick={() => setShowSeasonPicker(!showSeasonPicker)}
        className="flex items-center gap-1 bg-transparent border-none cursor-pointer p-0 text-[13px] text-muted hover:text-ink transition-colors"
      >
        <span>{activeSeason?.name || 'No season'}</span>
        <span className="text-[10px] leading-none">&#9662;</span>
      </button>

      {showSeasonPicker && (
        <div className="absolute left-0 top-full mt-1 bg-card border border-border shadow-lg z-20 min-w-[200px]">
          {seasons.map((s) => (
            <button
              key={s.id}
              onClick={() => handleSwitchSeason(s.id)}
              className={`w-full text-left px-4 py-2.5 text-[13px] cursor-pointer border-none bg-transparent flex items-center gap-2 hover:bg-surface ${
                s.id === activeSeason?.id ? 'text-ink font-semibold' : 'text-muted'
              }`}
            >
              {s.id === activeSeason?.id && (
                <span
                  className="w-1.5 h-1.5 flex-shrink-0"
                  style={{ background: brandColor }}
                />
              )}
              <span>{s.name}</span>
            </button>
          ))}

          <div className="border-t border-border px-3 py-2.5">
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="New season name"
                value={newSeasonName}
                onChange={(e) => setNewSeasonName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateSeason()}
                className="flex-1 px-2.5 py-1.5 text-[13px] border border-border bg-surface outline-none focus:border-[var(--brand,#1B4332)] min-w-0"
              />
              <button
                onClick={handleCreateSeason}
                disabled={!newSeasonName.trim() || creatingSeason}
                className="px-3 py-1.5 text-[12px] font-semibold text-white border-none cursor-pointer disabled:opacity-40"
                style={{ background: brandColor }}
              >
                {creatingSeason ? '...' : '+'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )

  return (
    <div style={{ '--brand': brandColor }}>
      <AppShell
        title={team?.name || 'Team Season'}
        subtitle={seasonPicker}
        actions={
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="w-9 h-9 flex items-center justify-center text-muted hover:text-ink cursor-pointer bg-transparent border border-border text-lg"
            >
              &equiv;
            </button>
            {showMenu && (
              <div className="absolute right-0 top-full mt-1 bg-card border border-border shadow-lg z-20 min-w-[160px]">
                <div className="px-4 py-3 border-b border-border">
                  <p className="text-xs text-light">{entries.length} entries</p>
                </div>
                <button
                  onClick={handleSignOut}
                  className="w-full text-left px-4 py-2.5 text-[13px] text-muted hover:bg-surface cursor-pointer border-none bg-transparent"
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        }
      >
        <EntryFeed />

        {/* FAB */}
        <button
          onClick={() => setShowComposer(true)}
          className="sticky bottom-6 ml-auto w-14 h-14 text-white text-2xl font-bold shadow-lg cursor-pointer border-none z-30 flex items-center justify-center hover:opacity-90 transition-opacity"
          style={{ background: brandColor }}
        >
          +
        </button>

        <EntryComposer open={showComposer} onClose={() => setShowComposer(false)} />
      </AppShell>
    </div>
  )
}
