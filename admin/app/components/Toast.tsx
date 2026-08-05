'use client'

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from 'react'

type ToastType = 'success' | 'error'

interface ToastItem {
  id: number
  type: ToastType
  message: string
}

interface ToastContextValue {
  success: (message: string) => void
  error: (message: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const TOAST_DURATION_MS = 3500

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const nextIdRef = useRef(0)

  const removeToast = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const push = useCallback(
    (type: ToastType, message: string) => {
      const id = ++nextIdRef.current
      setToasts((current) => [...current, { id, type, message }])
      setTimeout(() => removeToast(id), TOAST_DURATION_MS)
    },
    [removeToast]
  )

  const success = useCallback(
    (message: string) => push('success', message),
    [push]
  )

  const error = useCallback(
    (message: string) => push('error', message),
    [push]
  )

  return (
    <ToastContext.Provider value={{ success, error }}>
      {children}
      <div className="toast-stack" aria-live="polite">
        {toasts.map((toast) => (
          <button
            key={toast.id}
            type="button"
            className={`toast toast-${toast.type}`}
            onClick={() => removeToast(toast.id)}
          >
            {toast.message}
          </button>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within ToastProvider')
  }
  return context
}
