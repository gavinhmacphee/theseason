import { COLOR_PRESETS } from '../../lib/constants'

export default function ColorPicker({ value, onChange }) {
  return (
    <div className="flex gap-2 flex-wrap">
      {COLOR_PRESETS.map((c) => (
        <button
          key={c.hex}
          onClick={() => onChange(c.hex)}
          className="w-10 h-10 cursor-pointer transition-transform hover:scale-110 border-2"
          style={{
            background: c.hex,
            borderColor: value === c.hex ? '#fff' : 'transparent',
            outline: value === c.hex ? `2px solid ${c.hex}` : 'none',
          }}
          title={c.label}
          type="button"
        />
      ))}
    </div>
  )
}
