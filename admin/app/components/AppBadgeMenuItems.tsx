'use client'

import { useEffect, useState } from 'react'
import { useToast } from '@/app/components/Toast'
import { apiErrorMessage } from '@/lib/api-fetch'
import {
  fetchVapidPublicKey,
  getAppBadgeSubscription,
  isAppBadgeSupported,
  sendTestAppBadgePush,
  turnOffAppBadge,
  turnOnAppBadge,
} from '@/lib/app-badge-client'

type BadgeState =
  | { kind: 'unsupported' }
  | { kind: 'off'; publicKey: string | null }
  | { kind: 'on'; subscription: PushSubscription }

// "Turn on app badge" / "Turn off app badge" and "Send test", shown only in
// the Home Screen app. See ADR 0003.
export function AppBadgeMenuItems({ onDone }: { onDone: () => void }) {
  const toast = useToast()
  const [state, setState] = useState<BadgeState>({ kind: 'unsupported' })
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!isAppBadgeSupported()) {
      return
    }
    let cancelled = false
    void (async () => {
      const subscription = await getAppBadgeSubscription().catch(() => null)
      if (cancelled) return
      if (subscription) {
        setState({ kind: 'on', subscription })
        return
      }
      setState({ kind: 'off', publicKey: null })
      // Loaded ahead of the tap: iOS only prompts inside the user gesture.
      const publicKey = await fetchVapidPublicKey().catch(() => null)
      if (!cancelled) setState({ kind: 'off', publicKey })
    })()
    return () => {
      cancelled = true
    }
  }, [])

  if (state.kind === 'unsupported') {
    return null
  }

  async function run(action: () => Promise<void>, failure: string) {
    setBusy(true)
    try {
      await action()
    } catch (error) {
      toast.error(apiErrorMessage(error, failure))
    } finally {
      setBusy(false)
      onDone()
    }
  }

  return (
    <>
      {state.kind === 'off' ? (
        <button
          className="profile-menu-item"
          type="button"
          role="menuitem"
          disabled={busy || !state.publicKey}
          onClick={() =>
            run(async () => {
              const subscription = await turnOnAppBadge(state.publicKey!)
              setState({ kind: 'on', subscription })
              toast.success('App badge on: drops will update the icon')
            }, 'Could not turn on the app badge')
          }
        >
          Turn on app badge
        </button>
      ) : (
        <>
          <button
            className="profile-menu-item"
            type="button"
            role="menuitem"
            disabled={busy}
            onClick={() =>
              run(async () => {
                const result = await sendTestAppBadgePush(state.subscription)
                if (!result.ok) {
                  throw new Error('The push service did not accept the test')
                }
                toast.success(
                  result.count === null
                    ? 'Test sent (MAL is down, so no count)'
                    : `Test sent with ${result.count}`
                )
              }, 'Could not send a test push')
            }
          >
            Send test badge push
          </button>
          <button
            className="profile-menu-item"
            type="button"
            role="menuitem"
            disabled={busy}
            onClick={() =>
              run(async () => {
                await turnOffAppBadge(state.subscription)
                setState({
                  kind: 'off',
                  publicKey: await fetchVapidPublicKey().catch(() => null),
                })
                toast.success('App badge off')
              }, 'Could not turn off the app badge')
            }
          >
            Turn off app badge
          </button>
        </>
      )}
      <div className="profile-menu-divider" role="separator" />
    </>
  )
}
