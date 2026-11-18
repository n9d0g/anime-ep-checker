'use client'

import { useEffect, useState } from 'react'
import { BellOff, BellRing, Send, type LucideIcon } from 'lucide-react'
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

export interface AccountMenuAction {
  key: string
  label: string
  icon: LucideIcon
  disabled: boolean
  onSelect: () => void
}

// The Account menu's "Turn on app badge" / "Turn off app badge" and "Send
// test badge push", only in the Home Screen app (none elsewhere). ADR 0003.
export function useAppBadgeActions(onDone: () => void): AccountMenuAction[] {
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
    return []
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

  if (state.kind === 'off') {
    const { publicKey } = state
    return [
      {
        key: 'on',
        label: 'Turn on app badge',
        icon: BellRing,
        disabled: busy || !publicKey,
        onSelect: () =>
          run(async () => {
            const subscription = await turnOnAppBadge(publicKey!)
            setState({ kind: 'on', subscription })
            toast.success('App badge on: drops will update the icon')
          }, 'Could not turn on the app badge'),
      },
    ]
  }

  const { subscription } = state
  return [
    {
      key: 'test',
      label: 'Send test badge push',
      icon: Send,
      disabled: busy,
      onSelect: () =>
        run(async () => {
          const result = await sendTestAppBadgePush(subscription)
          if (!result.ok) {
            throw new Error('The push service did not accept the test')
          }
          toast.success(
            result.count === null
              ? 'Test sent (MAL is down, so no count)'
              : `Test sent with ${result.count}`
          )
        }, 'Could not send a test push'),
    },
    {
      key: 'off',
      label: 'Turn off app badge',
      icon: BellOff,
      disabled: busy,
      onSelect: () =>
        run(async () => {
          await turnOffAppBadge(subscription)
          setState({
            kind: 'off',
            publicKey: await fetchVapidPublicKey().catch(() => null),
          })
          toast.success('App badge off')
        }, 'Could not turn off the app badge'),
    },
  ]
}
