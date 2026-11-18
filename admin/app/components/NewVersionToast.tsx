'use client'

import { useEffect, useSyncExternalStore } from 'react'
import { toast } from 'sonner'
import { getLiveVersion, subscribeLiveVersion } from '@/lib/new-version'

/**
 * "vX.Y.Z is ready", once per new version (lib/new-version.ts). It stays
 * until Update (a reload) or ×, so nothing half-done is lost by surprise.
 */
export function NewVersionToast() {
  const live = useSyncExternalStore(
    subscribeLiveVersion,
    getLiveVersion,
    () => null
  )
  useEffect(() => {
    if (!live) return
    toast(`v${live} is ready`, {
      id: `new-version-${live}`,
      duration: Infinity,
      closeButton: true,
      action: { label: 'Update', onClick: () => location.reload() },
    })
  }, [live])
  return null
}
