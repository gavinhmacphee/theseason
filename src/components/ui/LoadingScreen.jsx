export default function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-surface">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-border border-t-brand animate-[spin_0.8s_linear_infinite] mx-auto mb-4" />
        <p className="font-[family-name:var(--font-display)] text-brand text-lg font-bold">
          Team Season
        </p>
      </div>
    </div>
  )
}
