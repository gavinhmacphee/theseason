import { useState, useRef, useCallback } from 'react'
import html2canvas from 'html2canvas'
import Modal from '../ui/Modal'
import ShareCardPreview from './ShareCardPreview'
import { useTeam } from '../../hooks/useTeam'
import { useToast } from '../../hooks/useToast'

export default function ShareModal({ entry, open, onClose }) {
  const { team } = useTeam()
  const { showToast } = useToast()
  const cardRef = useRef(null)
  const [rendering, setRendering] = useState(false)

  const renderCard = useCallback(async () => {
    if (!cardRef.current) return null
    const canvas = await html2canvas(cardRef.current, {
      scale: 3,
      useCORS: true,
      backgroundColor: '#FAFAF7',
    })
    return canvas
  }, [])

  const toBlob = (canvas) =>
    new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))

  const handleSave = async () => {
    setRendering(true)
    try {
      const canvas = await renderCard()
      if (!canvas) return
      const blob = await toBlob(canvas)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `team-season-${entry.entry_type}-${entry.entry_date}.png`
      a.click()
      URL.revokeObjectURL(url)
      showToast('Image saved!', 'success')
    } catch (err) {
      console.error('Save failed:', err)
      showToast('Failed to save image', 'error')
    }
    setRendering(false)
  }

  const handleCopy = async () => {
    if (!navigator.clipboard?.write) {
      showToast('Copy not supported in this browser', 'error')
      return
    }
    setRendering(true)
    try {
      const canvas = await renderCard()
      if (!canvas) return
      const blob = await toBlob(canvas)
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob }),
      ])
      showToast('Copied to clipboard!', 'success')
    } catch (err) {
      console.error('Copy failed:', err)
      showToast('Failed to copy image', 'error')
    }
    setRendering(false)
  }

  const handleShare = async () => {
    setRendering(true)
    try {
      const canvas = await renderCard()
      if (!canvas) return
      const blob = await toBlob(canvas)
      const file = new File([blob], `team-season-${entry.entry_date}.png`, {
        type: 'image/png',
      })
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: 'Team Season',
        })
      } else {
        showToast('Sharing not supported — try Save instead', 'error')
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('Share failed:', err)
        showToast('Failed to share', 'error')
      }
    }
    setRendering(false)
  }

  const canShare =
    typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  return (
    <Modal open={open} onClose={onClose} title="Share Entry">
      {/* Card preview */}
      <div className="flex justify-center mb-5">
        <div className="border border-border shadow-sm" style={{ width: 360 }}>
          <ShareCardPreview ref={cardRef} entry={entry} team={team} />
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={handleSave}
          disabled={rendering}
          className="flex-1 py-2.5 text-[13px] font-semibold cursor-pointer border border-border bg-card text-ink hover:bg-surface disabled:opacity-40 transition-colors"
        >
          {rendering ? 'Rendering...' : 'Save Image'}
        </button>
        <button
          onClick={handleCopy}
          disabled={rendering}
          className="flex-1 py-2.5 text-[13px] font-semibold cursor-pointer border border-border bg-card text-ink hover:bg-surface disabled:opacity-40 transition-colors"
        >
          Copy
        </button>
        {canShare && (
          <button
            onClick={handleShare}
            disabled={rendering}
            className="flex-1 py-2.5 text-[13px] font-semibold text-white cursor-pointer border-none disabled:opacity-40 transition-colors"
            style={{ background: 'var(--brand, #1B4332)' }}
          >
            Share
          </button>
        )}
      </div>
    </Modal>
  )
}
