'use client'

import { useRef, useState } from 'react'
import { CompleteRatingModal } from '@/app/components/CompleteRatingModal'
import { ShowListSkeleton } from '@/app/components/ListSkeleton'
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

      <div className="sticky-bar">
        <div className="sticky-bar-inner">
          <p className="status">
            {shows.rows.length} show{shows.rows.length === 1 ? '' : 's'}
          </p>
          <div className="sticky-actions">
            <button
              className="btn"
              type="button"
              onClick={shows.saveShows}
              disabled={shows.saving || shows.loading || !shows.isDirty}
            >
              {shows.saving ? 'Saving...' : 'Save changes'}
            </button>
          </div>
        </div>
      </div>

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
          onClose={() => setOpenSheet(null)}
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
          onRemoveBreak={(index) => shows.removeBreak(openRow.row.key, index)}
          onConfirmAnnouncedBreak={() =>
            void shows.confirmAnnouncedBreak(openRow.row.values)
          }
          onDismissAnnouncedBreak={() =>
            void shows.dismissAnnouncedBreak(openRow.row.values)
          }
          onComplete={() => progress.openCompletePrompt(openRow.row.values)}
          onHold={() => void progress.putShowOnHold(openRow.row.values)}
          onRemove={() => {
            shows.removeShow(openRow.row.key)
            setOpenSheet(null)
          }}
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
