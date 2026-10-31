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
import { useAniListMedia } from '@/app/components/useAniListMedia'
import { apiErrorMessage, apiFetch } from '@/lib/api-fetch'
import { formatReturn } from '@/lib/awaiting-return'
import { cacheKeys, withoutOnHoldEntry } from '@/lib/client-cache'
import { searchIndex } from '@/lib/search-index-store'
import type {
  OnHoldSnapshot,
  OnHoldSnapshotEntry,
  ReturnAnnouncement,
} from '@shared/types'
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
  announcement,
  coverUrl,
  restoring,
  savingReturn,
  onRestore,
  onSetAwaitingReturn,
  onClose,
}: {
  entry: OnHoldSnapshotEntry
  announcement: ReturnAnnouncement | null
  coverUrl: string | null
  restoring: boolean
  savingReturn: boolean
  onRestore: () => void
  onSetAwaitingReturn: (
    awaiting: boolean,
    officialNewsUrl: string
  ) => Promise<void>
  onClose: () => void
}) {
  const { show } = entry
  const awaiting = Boolean(entry.awaitingReturn)
  const savedUrl = entry.awaitingReturn?.officialNewsUrl ?? ''
  const [newsUrl, setNewsUrl] = useState(savedUrl)
  const provider = show.provider ?? 'crunchyroll'
  const { schedule } = show
  return (
    <AnimeSheet
      title={show.title || show.id}
      titleEnglish={show.titleEnglish}
      coverUrl={coverUrl}
      meta={formatHeldMeta(entry, announcement)}
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
      <SheetSection title="Return">
        <p className="hint">
          {awaiting
            ? announcement
              ? `${formatReturn(announcement)}.`
              : 'Awaiting return: its news is read daily, and Discord is alerted when a return is announced.'
            : 'Mark it awaiting return when the show itself has stopped airing: its news is read daily for when it comes back.'}
          {announcement?.sourceUrl ? (
            <>
              {' '}
              <a
                href={announcement.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Source
              </a>
            </>
          ) : null}
        </p>
        <div className="field">
          <label htmlFor={`return-news-${show.id}`}>Official news URL</label>
          <input
            id={`return-news-${show.id}`}
            type="url"
            value={newsUrl}
            onChange={(event) => setNewsUrl(event.target.value)}
            placeholder="https://example-anime.jp/news/"
          />
          <p className="hint">
            Optional. Anime News Network is always read; set the show&apos;s TV
            anime news page to read it too.
          </p>
        </div>
        <div className="actions sheet-manage">
          {awaiting ? (
            <>
              <button
                className="btn"
                type="button"
                disabled={savingReturn || newsUrl.trim() === savedUrl}
                onClick={() => void onSetAwaitingReturn(true, newsUrl)}
              >
                {savingReturn ? 'Saving…' : 'Save URL'}
              </button>
              <button
                className="btn btn-secondary"
                type="button"
                disabled={savingReturn}
                onClick={() => void onSetAwaitingReturn(false, newsUrl)}
              >
                Stop checking
              </button>
            </>
          ) : (
            <button
              className="btn"
              type="button"
              disabled={savingReturn}
              onClick={() => void onSetAwaitingReturn(true, newsUrl)}
            >
              {savingReturn ? 'Saving…' : 'Mark awaiting return'}
            </button>
          )}
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

// The snapshot plus what the checker last read about each return; a cached
// copy from before return checks has none.
type OnHoldView = OnHoldSnapshot & {
  returnAnnouncements?: Record<string, ReturnAnnouncement>
}

async function fetchOnHold(): Promise<OnHoldView | null> {
  const data = await apiFetch<{
    onHold?: OnHoldSnapshot | null
    returnAnnouncements?: Record<string, ReturnAnnouncement>
  }>('/api/on-hold', { errorMessage: 'Failed to load on-hold list' })
  return data.onHold
    ? { ...data.onHold, returnAnnouncements: data.returnAnnouncements ?? {} }
    : null
}

function formatHeldMeta(
  entry: OnHoldSnapshotEntry,
  announcement: ReturnAnnouncement | null = null
): string {
  const parts: string[] = []
  if (announcement && entry.awaitingReturn) {
    parts.push(formatReturn(announcement))
  } else if (entry.awaitingReturn) {
    parts.push('Awaiting return')
  }
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
    isUsable: (cached: OnHoldView) => Boolean(cached.entries?.length),
  })
  const snapshot = onHold.data
  const loading = onHold.loading
  const [restoringId, setRestoringId] = useState<string | null>(null)
  const [savingReturnId, setSavingReturnId] = useState<string | null>(null)
  const announcementFor = (entry: OnHoldSnapshotEntry) =>
    snapshot?.returnAnnouncements?.[entry.show.id] ?? null

  async function setAwaitingReturn(
    entry: OnHoldSnapshotEntry,
    awaiting: boolean,
    officialNewsUrl: string
  ) {
    const showId = entry.show.id
    setSavingReturnId(showId)
    try {
      const data = await apiFetch<{ entry?: OnHoldSnapshotEntry }>(
        '/api/on-hold',
        {
          method: 'PATCH',
          json: { showId, awaitingReturn: awaiting, officialNewsUrl },
          errorMessage: 'Failed to save',
        }
      )
      const saved = data.entry
      if (saved) {
        onHold.update((current) => ({
          ...current,
          entries: current.entries.map((item) =>
            item.show.id === showId ? saved : item
          ),
        }))
      }
      toast.success(
        awaiting
          ? 'Awaiting return. Its news is being read now, then daily.'
          : 'No longer checked for its return.'
      )
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Failed to save'))
    } finally {
      setSavingReturnId(null)
    }
  }

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
  const aniList = useAniListMedia(
    entries.map((entry) => entry.show.malId ?? 0).filter(Boolean)
  )

  return (
    <main className="container">
      <div className="page-heading">
        <h1>On hold</h1>
        <p className="subtitle">
          Shows taken out of Watching. They aren’t checked for episodes until
          you move them back; shows awaiting return are checked daily for news
          of when they come back.
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
              providerClass={providerDotClass(
                entry.show.provider ?? 'crunchyroll'
              )}
              bannerUrl={aniList(entry.show.malId)?.bannerUrl}
              coverUrl={aniList(entry.show.malId)?.coverUrl}
              meta={
                <span className="show-row-next-drop">
                  {formatHeldMeta(entry, announcementFor(entry))}
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
          key={openEntry.show.id}
          entry={openEntry}
          announcement={announcementFor(openEntry)}
          coverUrl={aniList(openEntry.show.malId)?.coverUrl ?? null}
          restoring={restoringId === openEntry.show.id}
          savingReturn={savingReturnId === openEntry.show.id}
          onSetAwaitingReturn={(awaiting, url) =>
            setAwaitingReturn(openEntry, awaiting, url)
          }
          onRestore={() => void restoreToWatching(openEntry)}
          onClose={() => setOpenId(null)}
        />
      ) : null}
    </main>
  )
}
