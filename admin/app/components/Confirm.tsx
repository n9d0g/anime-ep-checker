'use client'

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

export interface ConfirmOptions {
  /** The question, e.g. `Remove "Frieren"?` */
  title: string
  /** What happens if you go ahead. */
  description: string
  /** The go-ahead button, e.g. "Remove". */
  confirmLabel: string
  /** Red go-ahead, for removing something. */
  destructive?: boolean
}

type Confirm = (options: ConfirmOptions) => Promise<boolean>

const ConfirmContext = createContext<Confirm | null>(null)

/**
 * Asks before an action with the app's AlertDialog, in place of the
 * browser's window.confirm(). `await confirm({...})` is true for the
 * go-ahead and false for Cancel, Esc or a click on the backdrop.
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null)
  const resolveRef = useRef<((ok: boolean) => void) | null>(null)

  const confirm = useCallback<Confirm>((next) => {
    // A second question while one is open answers the first with "no".
    resolveRef.current?.(false)
    setOptions(next)
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve
    })
  }, [])

  function answer(ok: boolean) {
    resolveRef.current?.(ok)
    resolveRef.current = null
    setOptions(null)
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {options ? (
        <AlertDialog
          open
          onOpenChange={(open) => {
            if (!open) answer(false)
          }}
        >
          <AlertDialogContent onOverlayClick={() => answer(false)}>
            <AlertDialogHeader>
              <AlertDialogTitle>{options.title}</AlertDialogTitle>
              <AlertDialogDescription>
                {options.description}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                variant={options.destructive ? 'destructive' : 'default'}
                onClick={() => answer(true)}
              >
                {options.confirmLabel}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </ConfirmContext.Provider>
  )
}

export function useConfirm(): Confirm {
  const confirm = useContext(ConfirmContext)
  if (!confirm) {
    throw new Error('useConfirm must be used within ConfirmProvider')
  }
  return confirm
}
