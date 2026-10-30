import { NextResponse } from 'next/server'
import { tryDispatchCheckWorkflow, withErrorResponse } from '@/lib/api-route'
import { NO_STORE_HEADERS } from '@/lib/github'
import { normalizeShow } from '@/lib/normalize-show'
import { removeShow, saveShow, ShowChangedError } from '@/lib/save-shows'
import type { ShowFormValues } from '@/lib/types'

export const dynamic = 'force-dynamic'

const errorStatus = (error: unknown) =>
  error instanceof ShowChangedError ? 409 : 400

// Saves one show from its sheet: one Save, one commit. `loaded` is the show
// as the page loaded it (null for a new show), so an edit made elsewhere to
// the same show isn't overwritten.
export async function PUT(request: Request) {
  return withErrorResponse(
    { status: errorStatus, headers: NO_STORE_HEADERS },
    async () => {
      const body = (await request.json()) as {
        show?: ShowFormValues
        loaded?: ShowFormValues | null
      }
      if (!body.show) {
        throw new Error('show is required')
      }
      const show = normalizeShow(body.show)
      const { version, versionBefore } = await saveShow(
        show,
        body.loaded ?? null
      )

      return NextResponse.json(
        {
          ok: true,
          show,
          showsVersion: version,
          showsVersionBefore: versionBefore,
        },
        { headers: NO_STORE_HEADERS }
      )
    }
  )
}

// Removes one show; the checker's next run cleans up its Calendar events and
// Discord dashboard entry.
export async function DELETE(request: Request) {
  return withErrorResponse(
    { status: errorStatus, headers: NO_STORE_HEADERS },
    async () => {
      const body = (await request.json()) as { loaded?: ShowFormValues }
      if (!body.loaded?.id) {
        throw new Error('loaded show is required')
      }
      const { version, versionBefore } = await removeShow(body.loaded)
      const cleanupTriggered = await tryDispatchCheckWorkflow(false)

      return NextResponse.json(
        {
          ok: true,
          showsVersion: version,
          showsVersionBefore: versionBefore,
          cleanupTriggered,
        },
        { headers: NO_STORE_HEADERS }
      )
    }
  )
}
