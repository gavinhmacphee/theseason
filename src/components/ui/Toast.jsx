import { useToast } from '../../hooks/useToast'

const typeStyles = {
  info: 'bg-brand text-white',
  success: 'bg-win text-white',
  error: 'bg-loss text-white',
}

export default function Toast() {
  const { toast, dismissToast } = useToast()
  if (!toast) return null

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] animate-slide-up">
      <div
        className={`px-5 py-3 text-sm font-medium shadow-lg flex items-center gap-3 ${typeStyles[toast.type] || typeStyles.info}`}
        onClick={dismissToast}
      >
        {toast.message}
      </div>
    </div>
  )
}
