'use client'

interface ConfirmDialogProps {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Delete',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} />
      <div className="relative bg-white rounded-3xl shadow-2xl p-6 max-w-sm w-full border-3 border-candy-200 animate-bounce-in">
        <h2 className="text-xl font-extrabold text-grape-700 mb-2">{title}</h2>
        <p className="text-grape-500 mb-6">{message}</p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="btn-secondary flex-1 py-3 text-base"
          >
            Keep it!
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-3 rounded-full font-bold text-white bg-gradient-to-r from-red-400 to-red-500 hover:from-red-500 hover:to-red-600 active:scale-95 transition-all text-base"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
