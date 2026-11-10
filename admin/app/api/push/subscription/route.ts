import { NextResponse } from 'next/server'
import { withErrorResponse } from '@/lib/api-route'
import { getVapidKeys } from '@/lib/app-badge'
import { pushSubscriptions } from '@/lib/app-badge-server'
import { NO_STORE_HEADERS } from '@/lib/github'
import { isPushSubscriptionJson } from '@/lib/web-push'

export const dynamic = 'force-dynamic'

const ERRORS = { status: 400, headers: NO_STORE_HEADERS }

/** The VAPID public key a device subscribes with. */
export async function GET() {
  return withErrorResponse({ ...ERRORS, status: 500 }, async () =>
    NextResponse.json(
      { publicKey: getVapidKeys().publicKey },
      { headers: NO_STORE_HEADERS }
    )
  )
}

/** Saves this device's subscription (turning the App badge on). */
export async function POST(request: Request) {
  return withErrorResponse(ERRORS, async () => {
    const body = (await request.json()) as { subscription?: unknown }
    if (!isPushSubscriptionJson(body.subscription)) {
      throw new Error('subscription must have an https endpoint and keys')
    }
    await pushSubscriptions.put(body.subscription)
    return NextResponse.json({ ok: true }, { headers: NO_STORE_HEADERS })
  })
}

/** Forgets this device's subscription (turning the App badge off). */
export async function DELETE(request: Request) {
  return withErrorResponse(ERRORS, async () => {
    const body = (await request.json()) as { endpoint?: unknown }
    if (typeof body.endpoint !== 'string' || !body.endpoint) {
      throw new Error('endpoint is required')
    }
    await pushSubscriptions.remove(body.endpoint)
    return NextResponse.json({ ok: true }, { headers: NO_STORE_HEADERS })
  })
}
