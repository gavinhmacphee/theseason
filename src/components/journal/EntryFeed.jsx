import { useState } from 'react'
import { useEntries } from '../../hooks/useEntries'
import EntryCard from './EntryCard'
import FilterTabs from './FilterTabs'

export default function EntryFeed() {
  const { entries, loading } = useEntries()
  const [filter, setFilter] = useState('all')

  const filtered = filter === 'all'
    ? entries
    : entries.filter((e) => e.entry_type === filter)

  if (loading) {
    return (
      <div className="py-12 text-center">
        <div className="w-6 h-6 border-2 border-border border-t-brand animate-[spin_0.8s_linear_infinite] mx-auto mb-3" />
        <p className="text-sm text-muted">Loading entries...</p>
      </div>
    )
  }

  return (
    <div>
      <FilterTabs active={filter} onChange={setFilter} />

      <div className="mt-4 flex flex-col gap-3">
        {filtered.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-muted text-[15px] mb-1">
              {filter === 'all'
                ? 'No entries yet'
                : `No ${filter} entries yet`}
            </p>
            <p className="text-light text-[13px]">
              Tap the + button to capture a moment
            </p>
          </div>
        ) : (
          filtered.map((entry) => <EntryCard key={entry.id} entry={entry} />)
        )}
      </div>
    </div>
  )
}
