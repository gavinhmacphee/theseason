export default function AppShell({ children, title, subtitle, onBack, actions }) {
  return (
    <div className="max-w-[480px] mx-auto min-h-screen px-4 pb-24">
      <header className="py-4 flex items-center justify-between border-b border-border-light mb-5">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              onClick={onBack}
              className="bg-none border-none cursor-pointer text-xl text-muted p-1"
            >
              &larr;
            </button>
          )}
          <div>
            <h1 className="font-[family-name:var(--font-display)] text-[22px] font-bold text-[var(--brand,#1B4332)] leading-tight">
              {title}
            </h1>
            {subtitle && (
              <div className="text-[13px] text-muted mt-0.5">{subtitle}</div>
            )}
          </div>
        </div>
        {actions && <div className="flex gap-2">{actions}</div>}
      </header>
      {children}
    </div>
  )
}
