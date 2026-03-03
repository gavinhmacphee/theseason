import { useState } from 'react'
import { useEntries } from '../../hooks/useEntries'
import { usePhotos } from '../../hooks/usePhotos'
import { useTeam } from '../../hooks/useTeam'
import { useToast } from '../../hooks/useToast'
import { ENTRY_TYPES, ENTRY_TYPE_LABELS, RESULTS } from '../../lib/constants'
import { SPORTS } from '../../lib/constants'
import { generateId, todayISO } from '../../lib/utils'
import Button from '../ui/Button'
import Input, { Textarea } from '../ui/Input'
import PhotoUploader from '../ui/PhotoUploader'
import Modal from '../ui/Modal'

const QUICK_TYPES = ['game', 'practice', 'tournament', 'moment']

export default function EntryComposer({ open, onClose }) {
  const { createEntry } = useEntries()
  const { uploadPhoto } = usePhotos()
  const { team } = useTeam()
  const { showToast } = useToast()

  const [entryType, setEntryType] = useState('game')
  const [text, setText] = useState('')
  const [date, setDate] = useState(todayISO())
  const [opponent, setOpponent] = useState('')
  const [scoreHome, setScoreHome] = useState('')
  const [scoreAway, setScoreAway] = useState('')
  const [result, setResult] = useState('')
  const [venue, setVenue] = useState('')
  const [photoFile, setPhotoFile] = useState(null)
  const [photoPreview, setPhotoPreview] = useState(null)
  const [saving, setSaving] = useState(false)

  const sportObj = SPORTS.find((s) => s.name === team?.sport)
  const eventLabel = sportObj?.event || 'game'
  const hasScore = entryType === 'game' || entryType === 'tournament'

  const handlePhotoChange = (file) => {
    if (!file) {
      setPhotoFile(null)
      setPhotoPreview(null)
      return
    }
    setPhotoFile(file)
    const reader = new FileReader()
    reader.onload = (e) => setPhotoPreview(e.target.result)
    reader.readAsDataURL(file)
  }

  const resetForm = () => {
    setEntryType('game')
    setText('')
    setDate(todayISO())
    setOpponent('')
    setScoreHome('')
    setScoreAway('')
    setResult('')
    setVenue('')
    setPhotoFile(null)
    setPhotoPreview(null)
  }

  const handleSave = async () => {
    if (!text.trim() && !photoFile) {
      showToast('Write something or add a photo', 'error')
      return
    }

    setSaving(true)
    try {
      let photoUrl = null
      if (photoFile) {
        photoUrl = await uploadPhoto(photoFile)
      }

      await createEntry({
        id: generateId(),
        entry_type: entryType,
        text: text.trim(),
        entry_date: date,
        opponent: opponent.trim() || null,
        score_home: scoreHome !== '' ? parseInt(scoreHome, 10) : null,
        score_away: scoreAway !== '' ? parseInt(scoreAway, 10) : null,
        result: result || null,
        venue: venue.trim() || null,
        photo_url: photoUrl,
      })

      showToast('Entry saved!', 'success')
      resetForm()
      onClose()
    } catch (err) {
      console.error('Save failed:', err)
      showToast(err.message || 'Failed to save entry', 'error')
    }
    setSaving(false)
  }

  return (
    <Modal open={open} onClose={onClose} title="New Entry">
      {/* Entry type tabs */}
      <div className="flex gap-1.5 mb-5 flex-wrap">
        {QUICK_TYPES.map((t) => (
          <button
            key={t}
            onClick={() => setEntryType(t)}
            className={`px-3 py-1.5 text-[13px] font-semibold cursor-pointer transition-colors border ${
              entryType === t
                ? 'bg-[var(--brand,#1B4332)] text-white border-[var(--brand,#1B4332)]'
                : 'bg-transparent text-muted border-border'
            }`}
            type="button"
          >
            {ENTRY_TYPE_LABELS[t]}
          </button>
        ))}
      </div>

      {/* Date */}
      <Input
        label="Date"
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        className="mb-4"
      />

      {/* Opponent (games/tournaments) */}
      {hasScore && (
        <Input
          label="Opponent"
          placeholder="Lightning FC"
          value={opponent}
          onChange={(e) => setOpponent(e.target.value)}
          className="mb-4"
        />
      )}

      {/* Score */}
      {hasScore && (
        <div className="mb-4">
          <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">
            Score
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="0"
              placeholder="Us"
              value={scoreHome}
              onChange={(e) => setScoreHome(e.target.value)}
              className="w-20 px-3 py-2.5 border-[1.5px] border-border bg-card text-center text-[15px] outline-none focus:border-[var(--brand,#1B4332)]"
            />
            <span className="text-muted font-bold">-</span>
            <input
              type="number"
              min="0"
              placeholder="Them"
              value={scoreAway}
              onChange={(e) => setScoreAway(e.target.value)}
              className="w-20 px-3 py-2.5 border-[1.5px] border-border bg-card text-center text-[15px] outline-none focus:border-[var(--brand,#1B4332)]"
            />
          </div>
          {/* Result */}
          <div className="flex gap-1.5 mt-2.5">
            {RESULTS.map((r) => (
              <button
                key={r}
                onClick={() => setResult(result === r ? '' : r)}
                type="button"
                className={`px-3 py-1 text-[12px] font-bold uppercase cursor-pointer border ${
                  result === r
                    ? r === 'win'
                      ? 'bg-win text-white border-win'
                      : r === 'loss'
                      ? 'bg-loss text-white border-loss'
                      : 'bg-draw text-white border-draw'
                    : 'bg-transparent text-muted border-border'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Venue */}
      <Input
        label="Venue"
        placeholder="Memorial Field"
        value={venue}
        onChange={(e) => setVenue(e.target.value)}
        className="mb-4"
      />

      {/* Photo */}
      <div className="mb-4">
        <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">
          Photo
        </label>
        <PhotoUploader onPhoto={handlePhotoChange} preview={photoPreview} />
      </div>

      {/* Text */}
      <Textarea
        label="What happened?"
        placeholder="Two assists and the go-ahead goal..."
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        maxLength={2000}
        className="mb-5"
      />

      <div className="flex gap-3">
        <Button variant="ghost" size="md" onClick={onClose} type="button" className="flex-1">
          Cancel
        </Button>
        <Button size="md" onClick={handleSave} disabled={saving} type="button" className="flex-1">
          {saving ? 'Saving...' : 'Save'}
        </Button>
      </div>
    </Modal>
  )
}
