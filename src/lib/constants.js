export const SPORTS = [
  { name: 'Soccer', emoji: '\u26BD', event: 'game', eventDay: 'Game Day' },
  { name: 'Basketball', emoji: '\uD83C\uDFC0', event: 'game', eventDay: 'Game Day' },
  { name: 'Baseball', emoji: '\u26BE', event: 'game', eventDay: 'Game Day' },
  { name: 'Softball', emoji: '\uD83E\uDD4E', event: 'game', eventDay: 'Game Day' },
  { name: 'Hockey', emoji: '\uD83C\uDFD2', event: 'game', eventDay: 'Game Day' },
  { name: 'Lacrosse', emoji: '\uD83E\uDD4D', event: 'game', eventDay: 'Game Day' },
  { name: 'Football', emoji: '\uD83C\uDFC8', event: 'game', eventDay: 'Game Day' },
  { name: 'Volleyball', emoji: '\uD83C\uDFD0', event: 'match', eventDay: 'Match Day' },
  { name: 'Swimming', emoji: '\uD83C\uDFCA', event: 'meet', eventDay: 'Meet Day' },
  { name: 'Track & Field', emoji: '\uD83C\uDFC3', event: 'meet', eventDay: 'Meet Day' },
  { name: 'Tennis', emoji: '\uD83C\uDFBE', event: 'match', eventDay: 'Match Day' },
  { name: 'Other', emoji: '\uD83C\uDFC5', event: 'game', eventDay: 'Game Day' },
]

export const ENTRY_TYPES = ['game', 'practice', 'tournament', 'event', 'sightseeing', 'food', 'moment']

export const ENTRY_TYPE_LABELS = {
  game: 'Game',
  practice: 'Practice',
  tournament: 'Tournament',
  event: 'Event',
  sightseeing: 'Sightseeing',
  food: 'Food',
  moment: 'Moment',
}

export const ENTRY_TYPE_COLORS = {
  game: 'var(--color-brand)',
  practice: 'var(--color-practice)',
  tournament: 'var(--color-tournament)',
  event: 'var(--color-accent)',
  sightseeing: '#2563eb',
  food: '#d97706',
  moment: 'var(--color-moment)',
}

export const COLOR_PRESETS = [
  { hex: '#1B4332', label: 'Forest' },
  { hex: '#1B3A5C', label: 'Navy' },
  { hex: '#1D4ED8', label: 'Royal' },
  { hex: '#B91C1C', label: 'Red' },
  { hex: '#6B1D2A', label: 'Maroon' },
  { hex: '#5B21B6', label: 'Purple' },
  { hex: '#C2410C', label: 'Orange' },
  { hex: '#171717', label: 'Black' },
]

export const RESULTS = ['win', 'loss', 'draw']
