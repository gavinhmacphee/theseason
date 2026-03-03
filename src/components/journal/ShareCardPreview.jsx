import { forwardRef } from 'react'
import { ENTRY_TYPE_LABELS } from '../../lib/constants'
import { formatDate } from '../../lib/utils'

// Resolved hex colors for html2canvas (CSS variables don't render reliably)
const TYPE_COLORS_HEX = {
  game: null, // uses team color
  practice: '#457B9D',
  tournament: '#E07A5F',
  event: '#E07A5F',
  sightseeing: '#2563eb',
  food: '#d97706',
  moment: '#9B5DE5',
}

const RESULT_COLORS = { win: '#2D6A4F', loss: '#C1121F', draw: '#6B7280' }
const RESULT_LABELS = { win: 'W', loss: 'L', draw: 'D' }

/**
 * Pure visual card for share image rendering.
 * DOM size: 360x450. Rendered at scale 3 = 1080x1350 (4:5 Instagram).
 * Uses inline styles only for html2canvas compatibility.
 */
const ShareCardPreview = forwardRef(function ShareCardPreview({ entry, team }, ref) {
  const teamColor = team?.color || '#1B4332'
  const typeColor = TYPE_COLORS_HEX[entry.entry_type] || teamColor
  const typeLabel = ENTRY_TYPE_LABELS[entry.entry_type] || entry.entry_type
  const hasScore = entry.result && entry.score_home != null && entry.score_away != null

  return (
    <div
      ref={ref}
      style={{
        width: 360,
        height: 450,
        background: '#FAFAF7',
        fontFamily: '"DM Sans", -apple-system, sans-serif',
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Top accent bar */}
      <div style={{ height: 6, background: teamColor, flexShrink: 0 }} />

      {/* Header: type badge + date */}
      <div style={{ padding: '16px 20px 12px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <span
          style={{
            display: 'inline-block',
            padding: '4px 10px',
            fontSize: 11,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: '#fff',
            background: typeColor,
          }}
        >
          {typeLabel}
        </span>
        <span style={{ fontSize: 13, color: '#6B7280' }}>{formatDate(entry.entry_date)}</span>
      </div>

      {/* Score line */}
      {hasScore && (
        <div style={{ padding: '0 20px 12px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <span
            style={{
              fontSize: 28,
              fontWeight: 700,
              color: RESULT_COLORS[entry.result] || '#1A1A1A',
              lineHeight: 1,
            }}
          >
            {entry.score_home} - {entry.score_away}
          </span>
          <span
            style={{
              fontSize: 13,
              fontWeight: 700,
              textTransform: 'uppercase',
              color: RESULT_COLORS[entry.result] || '#6B7280',
            }}
          >
            {RESULT_LABELS[entry.result] || ''}
          </span>
          {entry.opponent && (
            <span style={{ fontSize: 13, color: '#6B7280' }}>vs {entry.opponent}</span>
          )}
        </div>
      )}

      {/* Opponent without score */}
      {!hasScore && entry.opponent && (
        <div style={{ padding: '0 20px 10px', fontSize: 13, color: '#6B7280', flexShrink: 0 }}>
          vs {entry.opponent}
        </div>
      )}

      {/* Photo */}
      {entry.photo_url && (
        <div style={{ padding: '0 20px', flexShrink: 0 }}>
          <img
            src={entry.photo_url}
            alt=""
            crossOrigin="anonymous"
            style={{
              width: '100%',
              height: 200,
              objectFit: 'cover',
              display: 'block',
            }}
          />
        </div>
      )}

      {/* Text */}
      {entry.text && (
        <div
          style={{
            padding: entry.photo_url ? '12px 20px 0' : '0 20px',
            fontSize: 14,
            lineHeight: 1.6,
            color: '#1A1A1A',
            flex: 1,
            overflow: 'hidden',
          }}
        >
          {entry.text.length > 200 ? entry.text.slice(0, 200) + '...' : entry.text}
        </div>
      )}

      {/* Venue */}
      {entry.venue && (
        <div style={{ padding: '6px 20px 0', fontSize: 11, color: '#9CA3AF', flexShrink: 0 }}>
          {entry.venue}
        </div>
      )}

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Footer */}
      <div
        style={{
          padding: '12px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderTop: '1px solid #E8E8E4',
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 11, color: '#9CA3AF' }}>{team?.name || ''}</span>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: teamColor,
            letterSpacing: '0.02em',
          }}
        >
          Team Season
        </span>
      </div>
    </div>
  )
})

export default ShareCardPreview
