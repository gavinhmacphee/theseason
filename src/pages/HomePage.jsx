import { useState, useRef, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useTeam } from '../hooks/useTeam'
import { useSeasons } from '../hooks/useSeasons'
import { useEntries } from '../hooks/useEntries'
import AppShell from '../components/ui/AppShell'
import EntryFeed from '../components/journal/EntryFeed'
import EntryComposer from '../components/journal/EntryComposer'

export default function HomePage() {
  const { signOut } = useAuth()
  const { team } = useTeam()
  const { activeSeason } = useSeasons()
  const { entries } = useEntries()
  const [showComposer, setShowComposer] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const menuRef = useRef(null)

  // Close menu on outside click
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

  const handleSignOut = async () => {
    try {
      await signOut()
    } catch (err) {
      console.error('Sign out failed:', err)
    }
  }

  const brandColor = team?.color || '#1B4332'

  return (
    <div style={{ '--brand': brandColor }}>
      <AppShell
        title={team?.name || 'Team Season'}
        subtitle={activeSeason?.name}
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
          className="fixed bottom-6 right-6 w-14 h-14 text-white text-2xl font-bold shadow-lg cursor-pointer border-none z-30 flex items-center justify-center hover:opacity-90 transition-opacity"
          style={{ background: brandColor }}
        >
          +
        </button>

        <EntryComposer open={showComposer} onClose={() => setShowComposer(false)} />
      </AppShell>
    </div>
  )
}
