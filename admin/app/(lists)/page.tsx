'use client'

import { useRef } from 'react'
import { CompleteRatingModal } from '@/app/components/CompleteRatingModal'
import { ShowListSkeleton } from '@/app/components/ListSkeleton'
import { ShowRow } from '@/app/components/ShowRow'
import { useEpisodeProgress } from '@/app/components/useEpisodeProgress'
import { useHashScrollHighlight } from '@/app/components/useHashScrollHighlight'
import { useWatchingShows } from '@/app/components/useWatchingShows'

export default function AdminPage() {
  useHashScrollHighlight()
  // Lets background refreshes wait for episode saves; the progress hook
  // needs the shows hook's state, so it's wired up after both exist.
  const episodeSavePendingRef = useRef<() => boolean>(() => false)
  const shows = useWatchingShows({
    isEpisodeSavePending: () => episodeSavePendingRef.current(),
  })
  const progress = useEpisodeProgress(shows)
  episodeSavePendingRef.current = progress.hasPendingSave

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
            onClick={shows.addShow}
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
              {shows.displayRows.map((displayRow) => {
                const { key, values } = displayRow.row
                return (
                  <ShowRow
                    key={key}
                    displayRow={displayRow}
                    episodeStatus={
                      values.id
                        ? (progress.episodeSaveStatus[values.id] ?? '')
                        : ''
                    }
                    completingShow={progress.completingShow}
                    holding={
                      Boolean(values.id) && progress.holdingShowId === values.id
                    }
                    onAdjustEpisode={(delta) =>
                      progress.adjustEpisode(values, delta)
                    }
                    onUpdate={(field, value) =>
                      shows.updateShow(key, field, value)
                    }
                    onUpdateSchedule={(field, value) =>
                      shows.updateSchedule(key, field, value)
                    }
                    onAddBreak={() => void shows.addBreak(values)}
                    onConfirmAnnouncedBreak={() =>
                      void shows.confirmAnnouncedBreak(values)
                    }
                    onDismissAnnouncedBreak={() =>
                      void shows.dismissAnnouncedBreak(values)
                    }
                    onRemoveBreak={(index) => shows.removeBreak(key, index)}
                    onComplete={() => progress.openCompletePrompt(values)}
                    onHold={() => void progress.putShowOnHold(values)}
                    onRemove={() => shows.removeShow(key)}
                  />
                )
              })}
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
