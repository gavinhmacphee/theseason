import { useState } from 'react'
import { useTeam } from '../../hooks/useTeam'
import { useSeasons } from '../../hooks/useSeasons'
import { useToast } from '../../hooks/useToast'
import { SPORTS } from '../../lib/constants'
import Button from '../ui/Button'
import Input from '../ui/Input'
import ColorPicker from '../ui/ColorPicker'

export default function TeamSetupScreen() {
  const { createTeam } = useTeam()
  const { createSeason } = useSeasons()
  const { showToast } = useToast()

  const [step, setStep] = useState(0) // 0: sport, 1: details
  const [sport, setSport] = useState('')
  const [teamName, setTeamName] = useState('')
  const [playerName, setPlayerName] = useState('')
  const [color, setColor] = useState('#1B4332')
  const [loading, setLoading] = useState(false)

  const sportObj = SPORTS.find((s) => s.name === sport)

  const handleCreate = async () => {
    if (!teamName.trim() || !playerName.trim()) return
    setLoading(true)
    try {
      const { teamId } = await createTeam({
        name: teamName.trim(),
        sport,
        color,
        playerName: playerName.trim(),
      })
      // Create first season
      const seasonName = `${sport} ${new Date().getFullYear()}`
      await createSeason(seasonName)
      showToast('Team created!', 'success')
    } catch (err) {
      console.error('Setup failed:', err)
      showToast(err.message || 'Failed to create team', 'error')
    }
    setLoading(false)
  }

  // Step 0: Pick sport
  if (step === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-surface">
        <div className="w-full max-w-[440px] animate-fade-in">
          <p className="text-xs font-semibold text-light uppercase tracking-widest text-center mb-3">
            Getting started
          </p>
          <h2 className="font-[family-name:var(--font-display)] text-[26px] font-extrabold text-ink text-center leading-tight mb-2">
            What sport does your kid play?
          </h2>
          <p className="text-[15px] text-muted text-center mb-8">
            Pick the main one. You can add more later.
          </p>

          <div className="grid grid-cols-2 gap-2.5">
            {SPORTS.filter((s) => s.name !== 'Other').map((s) => (
              <button
                key={s.name}
                onClick={() => {
                  setSport(s.name)
                  setTimeout(() => setStep(1), 150)
                }}
                className="w-full p-4 cursor-pointer border-2 text-[15px] font-semibold flex items-center gap-2.5 transition-all text-ink bg-white/85 hover:bg-surface"
                style={{
                  borderColor: sport === s.name ? '#1a1a1a' : '#e5e5e5',
                }}
              >
                <span className="text-[22px]">{s.emoji}</span>
                {s.name}
              </button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // Step 1: Team details
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-surface">
      <div className="w-full max-w-[440px] animate-fade-in">
        <button
          onClick={() => setStep(0)}
          className="text-sm text-muted font-semibold cursor-pointer bg-transparent border-none mb-6"
        >
          &larr; Back
        </button>

        <div className="flex items-center gap-2 mb-2">
          <span className="text-2xl">{sportObj?.emoji}</span>
          <p className="text-xs font-semibold text-light uppercase tracking-widest">
            {sport}
          </p>
        </div>

        <h2 className="font-[family-name:var(--font-display)] text-[26px] font-extrabold text-ink leading-tight mb-8">
          Set up your child
        </h2>

        <Input
          label="Team name"
          placeholder="Thunder FC"
          value={teamName}
          onChange={(e) => setTeamName(e.target.value)}
          className="mb-5"
        />

        <Input
          label="Your child's name"
          placeholder="Marco"
          value={playerName}
          onChange={(e) => setPlayerName(e.target.value)}
          className="mb-5"
        />

        <div className="mb-8">
          <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-2">
            Team color
          </label>
          <ColorPicker value={color} onChange={setColor} />
        </div>

        <Button
          size="full"
          onClick={handleCreate}
          disabled={loading || !teamName.trim() || !playerName.trim()}
          style={{ '--brand': color }}
        >
          {loading ? 'Creating...' : 'Start Your Season'}
        </Button>
      </div>
    </div>
  )
}
