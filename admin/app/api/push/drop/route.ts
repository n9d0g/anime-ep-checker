import { NextResponse } from 'next/server'
import { withErrorResponse } from '@/lib/api-route'
import {
  dropPushPayload,
  getVapidKeys,
  isDropNotice,
  isTriggerAuthorized,
  pushToSubscriptions,
} from '@/lib/app-badge'
import { loadAppBadgeCount, pushSubscriptions } from '@/lib/app-badge-server'
import { NO_STORE_HEADERS } from '@/lib/github'
import { getAdminPublicOrigin } from '@/lib/site-url'

export const dynamic = 'force-dynamic'

interface DropBody {
  /** The drop to notify about. */
  drop?: unknown
  /** Every drop alerted so far this run (including `drop`), not yet in state.json. */
  runDrops?: unknown
}

/**
 * Called by the checker when it alerts a drop (outside the admin session;
 * authorized by PUSH_TRIGGER_SECRET). Pushes the drop with the new count.
 */
export async function POST(request: Request) {
  if (
    !(await isTriggerAuthorized(
      request.headers.get('authorization'),
      process.env.PUSH_TRIGGER_SECRET
    ))
  ) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: NO_STORE_HEADERS }
    )
  }

  return withErrorResponse(
    { status: 500, headers: NO_STORE_HEADERS },
    async () => {
      const body = (await request.json()) as DropBody
      if (!isDropNotice(body.drop)) {
        return NextResponse.json(
          { error: 'drop must have showId, showTitle and episodeNumber' },
          { status: 400, headers: NO_STORE_HEADERS }
        )
      }
      const runDrops = Array.isArray(body.runDrops)
        ? body.runDrops.filter(isDropNotice)
        : []

      const subscriptions = await pushSubscriptions.list()
      if (subscriptions.length === 0) {
        return NextResponse.json(
          { ok: true, sent: 0, removed: 0, failed: 0, count: null },
          { headers: NO_STORE_HEADERS }
        )
      }

      const count = await loadAppBadgeCount([...runDrops, body.drop])
      const result = await pushToSubscriptions(
        subscriptions,
        dropPushPayload(body.drop, count, getAdminPublicOrigin()),
        { vapid: getVapidKeys(), store: pushSubscriptions }
      )

      return NextResponse.json(
        { ok: true, count, ...result },
        { headers: NO_STORE_HEADERS }
      )
    }
  )
}
