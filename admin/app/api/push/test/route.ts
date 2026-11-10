import { NextResponse } from 'next/server'
import { withErrorResponse } from '@/lib/api-route'
import {
  getVapidKeys,
  pushToSubscriptions,
  testPushPayload,
} from '@/lib/app-badge'
import { loadAppBadgeCount, pushSubscriptions } from '@/lib/app-badge-server'
import { NO_STORE_HEADERS } from '@/lib/github'
import { getAdminPublicOrigin } from '@/lib/site-url'
import { isPushSubscriptionJson } from '@/lib/web-push'

export const dynamic = 'force-dynamic'

/** Sends this device a push carrying the current App badge count. */
export async function POST(request: Request) {
  return withErrorResponse(
    { status: 400, headers: NO_STORE_HEADERS },
    async () => {
      const body = (await request.json()) as { subscription?: unknown }
      if (!isPushSubscriptionJson(body.subscription)) {
        throw new Error('subscription must have an https endpoint and keys')
      }

      const count = await loadAppBadgeCount()
      const result = await pushToSubscriptions(
        [body.subscription],
        testPushPayload(count, getAdminPublicOrigin()),
        { vapid: getVapidKeys(), store: pushSubscriptions }
      )

      return NextResponse.json(
        { ok: result.sent === 1, count, ...result },
        { headers: NO_STORE_HEADERS }
      )
    }
  )
}
