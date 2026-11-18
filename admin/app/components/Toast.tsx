'use client'

import type { ReactNode } from 'react'
import { toast } from 'sonner'
import { Toaster } from '@/components/ui/sonner'
import { NewVersionToast } from '@/app/components/NewVersionToast'

interface ToastApi {
  success: (message: string) => void
  error: (message: string) => void
}

// One object for the app's lifetime, so hooks can list it as a dependency.
const toastApi: ToastApi = {
  success: (message) => {
    toast.success(message)
  },
  error: (message) => {
    toast.error(message)
  },
}

export function ToastProvider({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <Toaster />
      <NewVersionToast />
    </>
  )
}

/** Short success and error messages (sonner, components/ui/sonner.tsx). */
export function useToast(): ToastApi {
  return toastApi
}
