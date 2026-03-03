export default function Input({ label, className = '', ...props }) {
  return (
    <div className={className}>
      {label && (
        <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">
          {label}
        </label>
      )}
      <input
        className="w-full px-4 py-3 border-[1.5px] border-border bg-card text-[15px] outline-none transition-colors focus:border-[var(--brand,#1B4332)]"
        {...props}
      />
    </div>
  )
}

export function Textarea({ label, className = '', ...props }) {
  return (
    <div className={className}>
      {label && (
        <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">
          {label}
        </label>
      )}
      <textarea
        className="w-full px-4 py-3 border-[1.5px] border-border bg-card text-[15px] outline-none transition-colors focus:border-[var(--brand,#1B4332)] resize-none"
        {...props}
      />
    </div>
  )
}
