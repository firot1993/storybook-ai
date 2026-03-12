'use client'

import { useState, useEffect, useCallback } from 'react'

interface Toast {
  id: number
  message: string
  type: 'error' | 'success'
}

let toastId = 0
let addToastGlobal: ((message: string, type: 'error' | 'success') => void) | null = null

export function showToast(message: string, type: 'error' | 'success' = 'error') {
  addToastGlobal?.(message, type)
}

export default function ToastContainer() {
  const [toasts, setToasts] = useState<Toast[]>([])

  const addToast = useCallback((message: string, type: 'error' | 'success') => {
    const id = ++toastId
    setToasts((prev) => [...prev, { id, message, type }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 5000)
  }, [])

  useEffect(() => {
    addToastGlobal = addToast
    return () => { addToastGlobal = null }
  }, [addToast])

  const dismiss = (id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }

  if (toasts.length === 0) return null

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`animate-slide-in rounded-2xl p-4 shadow-lg flex items-start gap-3 border-2 ${
            toast.type === 'error'
              ? 'bg-red-50 border-red-300 text-red-800'
              : 'bg-forest-50 border-forest-300 text-forest-800'
          }`}
        >
          <span className="text-2xl flex-shrink-0">
            {toast.type === 'error' ? '\u{1F625}' : '\u{1F389}'}
          </span>
          <p className="text-sm flex-1 font-medium">{toast.message}</p>
          <button
            onClick={() => dismiss(toast.id)}
            className="text-gray-400 hover:text-gray-600 flex-shrink-0"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  )
}
