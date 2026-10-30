'use client'

import { useRef, useState } from 'react'
import { CompleteRatingModal } from '@/app/components/CompleteRatingModal'
import { ShowListSkeleton } from '@/app/components/ListSkeleton'
import { Modal } from '@/app/components/Modal'
import { ShowRow } from '@/app/components/ShowRow'
import { ShowSheet } from '@/app/components/ShowSheet'
import { useEpisodeProgress } from '@/app/components/useEpisodeProgress'
import { useHashScrollHighlight } from '@/app/components/useHashScrollHighlight'
import { useWatchingShows } from '@/app/components/useWatchingShows'

// Which show's sheet is open: by row key (rows without an ID yet, e.g. a new
// show) or by show ID (a search result, possibly before the list loads).
type OpenSheet = { rowKey: string } | { showId: string } | null

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
