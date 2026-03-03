import { useState } from 'react'
import { ENTRY_TYPE_LABELS, ENTRY_TYPE_COLORS } from '../../lib/constants'
import { formatDate } from '../../lib/utils'
import { useEntries } from '../../hooks/useEntries'
import { useToast } from '../../hooks/useToast'
import ShareModal from './ShareModal'

export default function EntryCard({ entry }) {
  const { deleteEntry } = useEntries()
  const { showToast } = useToast()
  const [showMenu, setShowMenu] = useState(false)
  const [showShare, setShowShare] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const typeColor = ENTRY_TYPE_COLORS[entry.entry_type] || 'var(--color-brand)'
  const typeLabel = ENTRY_TYPE_LABELS[entry.entry_type] || entry.entry_type

  const resultColors = { win: 'text-win', loss: 'text-loss', draw: 'text-draw' }
  const resultLabels = { win: 'W', loss: 'L', draw: 'D' }

  const handleDelete = async () => {
    if (deleting) return
    setDeleting(true)
    try {
      await deleteEntry(entry.id)
      showToast('Entry deleted', 'info')
    } catch (err) {
      showToast('Failed to delete entry', 'error')
    }
    setDeleting(false)
    setShowMenu(false)
  }

  return (
    <div className="bg-card border border-border p-5 animate-fade-in relative">
      {/* Header: type badge + date + menu */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <span
            className="inline-block px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-white"
            style={{ background: typeColor }}
          >
            {typeLabel}
          </span>
          <span className="text-[13px] text-muted">{formatDate(entry.entry_date)}</span>
        </div>
        <div className="relative">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="text-light hover:text-muted cursor-pointer bg-transparent border-none text-lg px-1"
          >
            &middot;&middot;&middot;
          </button>
          {showMenu && (
            <div className="absolute right-0 top-full mt-1 bg-card border border-border shadow-lg z-10 min-w-[120px]">
              <button
                onClick={() => { setShowShare(true); setShowMenu(false) }}
                className="w-full text-left px-4 py-2.5 text-[13px] text-muted hover:bg-surface cursor-pointer border-none bg-transparent"
              >
                Share
              </button>
              <button
                onClick={handleDelete}
                className="w-full text-left px-4 py-2.5 text-[13px] text-loss hover:bg-surface cursor-pointer border-none bg-transparent"
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Score line */}
      {entry.result && entry.score_home != null && entry.score_away != null && (
        <div className="flex items-center gap-3 mb-3">
          <span className={`text-[22px] font-bold ${resultColors[entry.result] || 'text-ink'}`}>
            {entry.score_home} - {entry.score_away}
          </span>
          <span className={`text-xs font-bold uppercase ${resultColors[entry.result] || 'text-muted'}`}>
            {resultLabels[entry.result] || ''}
          </span>
          {entry.opponent && (
            <span className="text-[13px] text-muted">vs {entry.opponent}</span>
          )}
        </div>
      )}

      {/* Opponent without score */}
      {!entry.result && entry.opponent && (
        <p className="text-[13px] text-muted mb-2">vs {entry.opponent}</p>
      )}

      {/* Photo */}
      {entry.photo_url && (
        <img
          src={entry.photo_url}
          alt=""
          className="w-full h-52 object-cover mb-3"
          loading="lazy"
        />
      )}

      {/* Text */}
      {entry.text && (
        <p className="text-[15px] text-ink leading-relaxed">{entry.text}</p>
      )}

      {/* Venue */}
      {entry.venue && (
        <p className="text-[12px] text-light mt-2">{entry.venue}</p>
      )}

      <ShareModal entry={entry} open={showShare} onClose={() => setShowShare(false)} />
    </div>
  )
}
