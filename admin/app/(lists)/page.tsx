'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { CompleteRatingModal } from '@/app/components/CompleteRatingModal'
import { Inbox } from '@/app/components/Inbox'
import { ShowListSkeleton } from '@/app/components/ListSkeleton'
import { Modal } from '@/app/components/Modal'
import { MoveToWatchingModal } from '@/app/components/MoveToWatchingModal'
import { ShowRow } from '@/app/components/ShowRow'
import { ShowSheet } from '@/app/components/ShowSheet'
import { useEpisodeProgress } from '@/app/components/useEpisodeProgress'
import { useHashScrollHighlight } from '@/app/components/useHashScrollHighlight'
import { useWatchingShows } from '@/app/components/useWatchingShows'
import { useToast } from '@/app/components/Toast'
import { apiErrorMessage } from '@/lib/api-fetch'
import {
  cacheKeys,
  updateJsonCache,
  withoutPtwEntry,
  type BootstrapCache,
} from '@/lib/client-cache'
import { buildInbox } from '@/lib/inbox'
import {
  inboxCount,
  readDismissedInboxKeys,
  writeDismissedInboxKeys,
} from '@/lib/inbox-store'
import { moveToWatchingMessage, requestMoveToWatching } from '@/lib/ptw-move'
import { searchIndex } from '@/lib/search-index-store'
import type {
  PlanToWatchSnapshot,
  PlanToWatchSnapshotEntry,
} from '@shared/types'

// Which show's sheet is open: by row key (rows without an ID yet, e.g. a new
// show) or by show ID (a search result, possibly before the list loads). An
// inbox action can open it on a Setup field.
type SetupField = 'official-news' | 'mal'
type OpenSheet =
  | { rowKey: string }
  | { showId: string; focusField?: SetupField }
  | null

export default function AdminPage() {
  const [openSheet, setOpenSheet] = useState<OpenSheet>(null)
  // The row whose unsaved Setup edits are waiting on "Discard changes?".
  const [discardKey, setDiscardKey] = useState<string | null>(null)
  useHashScrollHighlight((elementId) => {
    if (elementId.startsWith('show-')) {
      setOpenSheet({ showId: elementId.slice('show-'.length) })
    }
  })
  // Lets background refreshes wait for episode saves; the progress hook
  // needs the shows hook's state, so it's wired up after both exist.
  const episodeSavePendingRef = useRef<() => boolean>(() => false)
  const shows = useWatchingShows({
    isEpisodeSavePending: () => episodeSavePendingRef.current(),
  })
  const progress = useEpisodeProgress(shows)
  episodeSavePendingRef.current = progress.hasPendingSave
  const toast = useToast()

  // Inbox items put off with "Not now"; read after mount (browser storage).
  const [dismissedKeys, setDismissedKeys] = useState<ReadonlySet<string>>(
    () => new Set()
  )
  useEffect(() => setDismissedKeys(readDismissedInboxKeys()), [])
  const inboxItems = useMemo(
    () =>
      buildInbox({
        shows: shows.savedShows,
        showStates: shows.showStates,
        airingPlanToWatch: shows.airingPlanToWatch,
        dismissedKeys,
      }),
    [shows.savedShows, shows.showStates, shows.airingPlanToWatch, dismissedKeys]
  )
  useEffect(() => {
    inboxCount.set(shows.loading ? null : inboxItems.length)
  }, [shows.loading, inboxItems.length])

  const [moveEntry, setMoveEntry] = useState<PlanToWatchSnapshotEntry | null>(
    null
  )
  const [moving, setMoving] = useState(false)

  function savedShowValues(showId: string) {
    return shows.savedShows.find((show) => show.id === showId)
  }

  async function moveToWatching(
    entry: PlanToWatchSnapshotEntry,
    values: Parameters<typeof requestMoveToWatching>[1]
  ) {
    setMoving(true)
    try {
      const data = await requestMoveToWatching(entry, values)
      const remaining = shows.airingPlanToWatch.filter(
        (airing) => airing.malId !== entry.malId
      )
      shows.setAiringPlanToWatch(remaining)
      updateJsonCache<BootstrapCache>(cacheKeys.bootstrap, (cached) => ({
        ...cached,
        airingPlanToWatch: remaining,
      }))
      updateJsonCache<PlanToWatchSnapshot>(cacheKeys.ptw, (cached) =>
        withoutPtwEntry(cached, entry.malId)
      )
      searchIndex.invalidate()
      setMoveEntry(null)
      toast.success(moveToWatchingMessage(data))
      void shows.reload()
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Failed to move show to watching'))
    } finally {
      setMoving(false)
    }
  }

  const openRow = openSheet
    ? shows.displayRows.find((displayRow) =>
        'rowKey' in openSheet
          ? displayRow.row.key === openSheet.rowKey
          : displayRow.row.values.id === openSheet.showId
      )
    : undefined

  // Closing with unsaved Setup edits asks first; an untouched new show just
  // goes away.
  function closeSheet() {
    if (openRow) {
      const { key, values } = openRow.row
      if (shows.isRowDirty(key)) {
        setDiscardKey(key)
        return
      }
      if (!values.id) {
        shows.revertShow(key)
      }
    }
    setOpenSheet(null)
  }

  return (
    <>
      <main className="container">
        <div className="page-heading page-heading-row">
          <div>
            <h1>Watching</h1>
            <p className="subtitle">
              The shows the checker is tracking. Times are Eastern (ET).
            </p>
          </div>
          <button
            className="btn btn-secondary btn-icon"
            type="button"
            aria-label="Add show"
            title="Add show"
            onClick={() => setOpenSheet({ rowKey: shows.addShow() })}
          >
            +
          </button>
        </div>

        {shows.malDown ? (
          <div className="mal-down-banner" role="status">
            <strong>MyAnimeList is down.</strong> Watch progress can’t be loaded
            or changed until it’s back.
          </div>
        ) : null}

        <Inbox
          items={inboxItems}
          onAddBreak={(showId) => {
            const show = savedShowValues(showId)
            if (show) {
              void shows.confirmAnnouncedBreak(show)
            }
          }}
          onDismissBreak={(showId) => {
            const show = savedShowValues(showId)
            if (show) {
              void shows.dismissAnnouncedBreak(show)
            }
          }}
          onOpenSetup={(showId, focusField) =>
            setOpenSheet({ showId, focusField })
          }
          onMoveToWatching={(item) => setMoveEntry(item.entry)}
          onNotNow={(key) => {
            const next = new Set(dismissedKeys).add(key)
            setDismissedKeys(next)
            writeDismissedInboxKeys(next)
          }}
        />

        <section className="stack">
          {shows.loading ? (
            <ShowListSkeleton />
          ) : shows.rows.length === 0 ? (
            <div className="panel empty">No shows yet. Add one with +.</div>
          ) : (
            <div className="panel show-list">
              {shows.displayRows.map((displayRow) => (
                <ShowRow
                  key={displayRow.row.key}
                  displayRow={displayRow}
                  onOpen={() => setOpenSheet({ rowKey: displayRow.row.key })}
                />
              ))}
            </div>
          )}
        </section>
      </main>

      {openRow ? (
        <ShowSheet
          key={openRow.row.key}
          displayRow={openRow}
          episodeStatus={
            openRow.row.values.id
              ? (progress.episodeSaveStatus[openRow.row.values.id] ?? '')
              : ''
          }
          completingShow={progress.completingShow}
          holding={
            Boolean(openRow.row.values.id) &&
            progress.holdingShowId === openRow.row.values.id
          }
          focusField={
            openSheet && 'focusField' in openSheet
              ? openSheet.focusField
              : undefined
          }
          dirty={shows.isRowDirty(openRow.row.key)}
          saving={shows.savingKey === openRow.row.key}
          onClose={closeSheet}
          onSave={() => {
            void shows.saveShow(openRow.row.key).then((savedKey) => {
              if (savedKey && savedKey !== openRow.row.key) {
                setOpenSheet({ rowKey: savedKey })
              }
            })
          }}
          onRevert={() => shows.revertShow(openRow.row.key)}
          onAdjustEpisode={(delta) =>
            progress.adjustEpisode(openRow.row.values, delta)
          }
          onUpdate={(field, value) =>
            shows.updateShow(openRow.row.key, field, value)
          }
          onUpdateSchedule={(field, value) =>
            shows.updateSchedule(openRow.row.key, field, value)
          }
          onAddBreak={() => void shows.addBreak(openRow.row.values)}
          onRemoveBreak={(index) =>
            void shows.removeBreak(openRow.row.key, index)
          }
          onConfirmAnnouncedBreak={() =>
            void shows.confirmAnnouncedBreak(openRow.row.values)
          }
          onDismissAnnouncedBreak={() =>
            void shows.dismissAnnouncedBreak(openRow.row.values)
          }
          onComplete={() => progress.openCompletePrompt(openRow.row.values)}
          onHold={() => void progress.putShowOnHold(openRow.row.values)}
          onRemove={() => {
            void shows.removeShow(openRow.row.key).then((removed) => {
              if (removed) {
                setOpenSheet(null)
              }
            })
          }}
        />
      ) : null}

      {discardKey ? (
        <Modal
          title="Discard changes?"
          subtitle="Your Setup edits haven’t been saved."
          submitting={false}
          onCancel={() => setDiscardKey(null)}
          primaryAction={
            <button
              className="btn btn-discard"
              type="button"
              onClick={() => {
                shows.revertShow(discardKey)
                setDiscardKey(null)
                setOpenSheet(null)
              }}
            >
              Discard
            </button>
          }
        />
      ) : null}

      {moveEntry ? (
        <MoveToWatchingModal
          entry={moveEntry}
          submitting={moving}
          onCancel={() => setMoveEntry(null)}
          onSubmit={(values) => void moveToWatching(moveEntry, values)}
        />
      ) : null}

      {progress.completePrompt ? (
        <CompleteRatingModal
          prompt={progress.completePrompt}
          submitting={progress.completingShow}
          onCancel={progress.cancelCompletePrompt}
          onConfirm={(score) => void progress.confirmCompletePrompt(score)}
        />
      ) : null}
    </>
  )
}
