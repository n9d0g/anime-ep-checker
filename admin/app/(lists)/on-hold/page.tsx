'use client'

import { useState } from 'react'
import Link from 'next/link'
import { AnimeFacts, AnimeSheet } from '@/app/components/AnimeSheet'
import { ListRow } from '@/app/components/ListRow'
import { SheetSection } from '@/app/components/Sheet'
import { useCachedResource } from '@/app/components/useCachedResource'
import { useHashScrollHighlight } from '@/app/components/useHashScrollHighlight'
import { PtwListSkeleton } from '@/app/components/ListSkeleton'
import { useToast } from '@/app/components/Toast'
import { apiErrorMessage, apiFetch } from '@/lib/api-fetch'
import { cacheKeys, withoutOnHoldEntry } from '@/lib/client-cache'
import { searchIndex } from '@/lib/search-index-store'
import type { OnHoldSnapshot, OnHoldSnapshotEntry } from '@shared/types'
import {
  formatEasternDateTime,
  formatShortDate,
  formatUpdatedAgo,
} from '@/lib/time'
import { providerDotClass } from '@/lib/watching'
import { getShowWatchUrl } from '@shared/shows'

const PROVIDER_LABELS = {
  crunchyroll: 'Crunchyroll',
  netflix: 'Netflix',
  disney: 'Disney+',
} as const

// An On hold show in its sheet: Move back to Watching, then what it was set
// up with.
function OnHoldSheet({
  entry,
  restoring,
  onRestore,
  onClose,
}: {
  entry: OnHoldSnapshotEntry
  restoring: boolean
  onRestore: () => void
  onClose: () => void
}) {
  const { show } = entry
  const provider = show.provider ?? 'crunchyroll'
  const { schedule } = show
  return (
    <AnimeSheet
      title={show.title || show.id}
      titleEnglish={show.titleEnglish}
      coverUrl={null}
      meta={formatHeldMeta(entry)}
      onClose={onClose}
    >
      <SheetSection title="Manage">
        <p className="hint">
          Moving it back resumes episode checks and Discord alerts, and marks it
          watching on MyAnimeList.
        </p>
        <div className="actions sheet-manage">
          <button
            className="btn"
            type="button"
            disabled={restoring}
            onClick={onRestore}
          >
            {restoring ? 'Saving…' : 'Move back to Watching'}
          </button>
          <a
            className="btn btn-secondary"
            href={getShowWatchUrl(show)}
            target="_blank"
            rel="noopener noreferrer"
          >
            Watch on {PROVIDER_LABELS[provider]}
          </a>
        </div>
      </SheetSection>
      {show.malId ? (
        <SheetSection title="Setup">
          <AnimeFacts
            malId={show.malId}
            title={show.title}
            facts={[
              ['Provider', PROVIDER_LABELS[provider]],
              ['First drop', formatEasternDateTime(schedule.startAt)],
              [
                'Episodes',
                schedule.mode === 'finite' && schedule.episodeCount
                  ? `${schedule.episodeCount} from ep ${schedule.startEpisode}`
                  : 'Ongoing',
              ],
              [
                'Breaks',
                schedule.breaks?.length
                  ? schedule.breaks
                      .map(
                        (entry) =>
                          `${entry.weeks}w after ep ${entry.afterEpisode}`
                      )
                      .join(', ')
                  : null,
              ],
            ]}
          />
        </SheetSection>
      ) : null}
    </AnimeSheet>
  )
}

async function fetchOnHold(): Promise<OnHoldSnapshot | null> {
  const data = await apiFetch<{ onHold?: OnHoldSnapshot | null }>(
    '/api/on-hold',
    { errorMessage: 'Failed to load on-hold list' }
  )
  return data.onHold ?? null
}

function formatHeldMeta(entry: OnHoldSnapshotEntry): string {
  const parts: string[] = []
  const held = formatShortDate(entry.heldAt)
  if (held) {
    parts.push(`On hold since ${held}`)
  }
  if (
    entry.show.schedule.mode === 'finite' &&
    entry.show.schedule.episodeCount
  ) {
    parts.push(`${entry.show.schedule.episodeCount} ep`)
  }
  return parts.join(' · ')
}

export default function OnHoldPage() {
  const toast = useToast()
  const [openId, setOpenId] = useState<string | null>(null)
  // Open the show a search result links to.
  useHashScrollHighlight((elementId) => {
    if (elementId.startsWith('show-')) {
      setOpenId(elementId.slice('show-'.length))
    }
  })
  const onHold = useCachedResource({
    cacheKey: cacheKeys.onHold,
    fetch: fetchOnHold,
    isUsable: (cached: OnHoldSnapshot) => Boolean(cached.entries?.length),
  })
  const snapshot = onHold.data
  const loading = onHold.loading
  const [restoringId, setRestoringId] = useState<string | null>(null)

  async function restoreToWatching(entry: OnHoldSnapshotEntry) {
    const showId = entry.show.id
    const label = entry.show.title || showId

    if (
      !window.confirm(
        `Move "${label}" back to watching? It will be tracked again and marked watching on MyAnimeList.`
      )
    ) {
      return
    }

    setRestoringId(showId)

    try {
      const data = await apiFetch<{
        malUpdated?: boolean
        workflowTriggered?: boolean
      }>('/api/on-hold', {
        method: 'POST',
        json: { showId },
        errorMessage: 'Failed to restore to watching',
      })

      onHold.update((current) => withoutOnHoldEntry(current, showId))
      searchIndex.invalidate()

      if (data.malUpdated === false) {
        toast.success(
          'Added to watching. MAL status could not be updated — mark it watching there if needed.'
        )
      } else if (data.workflowTriggered) {
        toast.success('Moved to watching. The dashboard will refresh shortly.')
      } else {
        toast.success('Moved to watching.')
      }
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Failed to restore to watching'))
    } finally {
      setRestoringId(null)
    }
  }

  const entries = snapshot?.entries ?? []
  const openEntry = entries.find((entry) => entry.show.id === openId)

  return (
    <main className="container">
      <div className="page-heading">
        <h1>On hold</h1>
        <p className="subtitle">
          Shows taken out of Watching. They aren’t checked and send no alerts
          until you move them back.
        </p>
      </div>

      {loading ? (
        <PtwListSkeleton />
      ) : entries.length === 0 ? (
        <div className="panel empty">
          No shows on hold. Put a show on hold from{' '}
          <Link href="/">Watching</Link>.
        </div>
      ) : (
        <div className="panel show-list">
          {entries.map((entry) => (
            <ListRow
              key={entry.show.id}
              id={`show-${entry.show.id}`}
              title={entry.show.title || entry.show.id}
              titleEnglish={entry.show.titleEnglish}
              marker={
                <span
                  className={`provider-dot ${providerDotClass(
                    entry.show.provider ?? 'crunchyroll'
                  )}`}
                  aria-hidden="true"
                />
              }
              meta={
                <span className="show-row-next-drop">
                  {formatHeldMeta(entry)}
                </span>
              }
              onOpen={() => setOpenId(entry.show.id)}
            />
          ))}
        </div>
      )}

      {snapshot?.updatedAt ? (
        <p className="hint ptw-updated">
          {formatUpdatedAgo(snapshot.updatedAt)}
        </p>
      ) : null}

      {openEntry ? (
        <OnHoldSheet
          entry={openEntry}
          restoring={restoringId === openEntry.show.id}
          onRestore={() => void restoreToWatching(openEntry)}
          onClose={() => setOpenId(null)}
        />
      ) : null}
    </main>
  )
}
