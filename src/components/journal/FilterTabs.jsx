import { ENTRY_TYPE_LABELS } from '../../lib/constants'

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'game', label: 'Games' },
  { key: 'practice', label: 'Practice' },
  { key: 'tournament', label: 'Tournaments' },
  { key: 'moment', label: 'Moments' },
]

export default function FilterTabs({ active, onChange }) {
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 no-scrollbar">
      {TABS.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onChange(tab.key)}
          className={`shrink-0 px-3.5 py-1.5 text-[13px] font-semibold cursor-pointer transition-colors border ${
            active === tab.key
              ? 'bg-[var(--brand,#1B4332)] text-white border-[var(--brand,#1B4332)]'
              : 'bg-transparent text-muted border-border hover:bg-border-light'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
