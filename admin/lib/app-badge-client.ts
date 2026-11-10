// Browser side of the App badge: Declarative Web Push subscribes on
// `window.pushManager` (iOS 18.4+ Home Screen apps), no service worker.

import { apiFetch } from './api-fetch'
import { base64UrlDecode } from './web-push'

interface BadgeNavigator {
  setAppBadge?: (count?: number) => Promise<void>
  clearAppBadge?: () => Promise<void>
  standalone?: boolean
}

function windowPushManager(): PushManager | null {
  if (typeof window === 'undefined') {
    return null
  }
  return (window as Window & { pushManager?: PushManager }).pushManager ?? null
}

/** Running as the Home Screen app, the only place iOS shows a badge. */
export function isStandaloneApp(): boolean {
  if (typeof window === 'undefined') {
    return false
  }
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    (navigator as BadgeNavigator).standalone === true
  )
}

export function isAppBadgeSupported(): boolean {
  return isStandaloneApp() && windowPushManager() !== null
}

/**
 * Sets the icon's number from a fresh count, clearing it at 0. Null (MAL
 * down) leaves the badge alone. Without notification permission iOS ignores it.
 */
export async function syncAppBadge(count: number | null): Promise<void> {
  const badgeNavigator = navigator as BadgeNavigator
  if (count === null || !badgeNavigator.setAppBadge) {
    return
  }
  try {
    if (count > 0) {
      await badgeNavigator.setAppBadge(count)
    } else {
      await badgeNavigator.clearAppBadge?.()
    }
  } catch {
    // No permission yet, or not a Home Screen app: nothing to update.
  }
}

export function getAppBadgeSubscription(): Promise<PushSubscription | null> {
  return windowPushManager()?.getSubscription() ?? Promise.resolve(null)
}

export async function fetchVapidPublicKey(): Promise<string> {
  const data = await apiFetch<{ publicKey: string }>('/api/push/subscription', {
    errorMessage: 'Failed to load push settings',
  })
  return data.publicKey
}

/**
 * Asks for permission and subscribes this device. Call straight from a tap
 * with the key already loaded: iOS only prompts inside the user gesture.
 */
export async function turnOnAppBadge(
  publicKey: string
): Promise<PushSubscription> {
  const pushManager = windowPushManager()
  if (!pushManager) {
    throw new Error('Add the app to your Home Screen to use the app badge')
  }
  const subscription = await pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: base64UrlDecode(publicKey),
  })
  await apiFetch('/api/push/subscription', {
    method: 'POST',
    json: { subscription: subscription.toJSON() },
    errorMessage: 'Failed to save this device',
  })
  return subscription
}

export async function turnOffAppBadge(
  subscription: PushSubscription
): Promise<void> {
  const { endpoint } = subscription
  await subscription.unsubscribe()
  await apiFetch('/api/push/subscription', {
    method: 'DELETE',
    json: { endpoint },
    errorMessage: 'Failed to forget this device',
  })
  try {
    await (navigator as BadgeNavigator).clearAppBadge?.()
  } catch {
    // Already clear.
  }
}

export async function sendTestAppBadgePush(
  subscription: PushSubscription
): Promise<{ count: number | null; ok: boolean }> {
  return apiFetch('/api/push/test', {
    method: 'POST',
    json: { subscription: subscription.toJSON() },
    errorMessage: 'Failed to send a test push',
  })
}
