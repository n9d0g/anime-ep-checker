'use client'

import { useState, useSyncExternalStore } from 'react'
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
  const [dismissed, setDismissed] = useState<string | null>(null)
  if (!live || live === dismissed) return null

  return (
    <div className="toast toast-update" role="status">
      <span className="toast-update-text">v{live} is ready</span>
      <button
        type="button"
        className="btn btn-sm toast-update-btn"
        onClick={() => location.reload()}
      >
        Update
      </button>
      <button
        type="button"
        className="toast-update-close"
        aria-label="Dismiss"
        onClick={() => setDismissed(live)}
      >
        ×
      </button>
    </div>
  )
}
