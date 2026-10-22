'use client'

import { useState, type ComponentProps } from 'react'
import { ShowEditForm } from '@/app/components/ShowEditForm'
import { ShowTitleDisplay } from '@/app/components/ShowTitleDisplay'
import type { EpisodeSaveStatus } from '@/app/components/useEpisodeProgress'
import type { DisplayRow } from '@/app/components/useWatchingShows'
import { MAL_DOWN_MESSAGE } from '@/lib/watching'

type EditFormHandlers = Pick<
  ComponentProps<typeof ShowEditForm>,
  | 'onUpdate'
  | 'onUpdateSchedule'
  | 'onDelay'
  | 'onComplete'
  | 'onHold'
  | 'onRemove'
>

// One show in the Watching list: a header that expands to quick links, the
// episode stepper and the edit form. Render it keyed by the row key so the
// expand/edit state follows the show, not its list position. New shows start
// expanded.
export function ShowRow({
  displayRow,
  episodeStatus,
  completingShow,
  holding,
  onAdjustEpisode,
  ...handlers
}: {
  displayRow: DisplayRow
  episodeStatus: EpisodeSaveStatus
  completingShow: boolean
  holding: boolean
  onAdjustEpisode: (delta: number) => void
} & EditFormHandlers) {
  const { row, index, liveState, view } = displayRow
  const show = row.values
  const [open, setOpen] = useState(() => !show.id)
  const [malEditOpen, setMalEditOpen] = useState(false)
  const episodeSaving = episodeStatus === 'saving'
  const { currentEpisode, badge, malBlocked } = view
  const { min, max } = view.bounds

  return (
    <article
      id={show.id ? `show-${show.id}` : undefined}
      className={`show-row${open ? ' expanded' : ''}`}
    >
      <button
        type="button"
        className="show-row-header"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <div className="show-row-leading">
          <span
            className={`provider-dot ${view.providerDotClass}`}
            aria-hidden="true"
          />
          <ShowTitleDisplay
            title={show.title || `Show ${index + 1}`}
            titleEnglish={show.titleEnglish}
            belowSubtitle={
              view.nextEpisodeLine ? (
                <span className="show-row-next-episode">
                  {view.nextEpisodeLine}
                </span>
              ) : null
            }
          />
        </div>
        <div className="show-row-trailing">
          <span
            className={`ep-count${badge.behind ? ' ep-count-behind' : ''}${
              badge.malDown ? ' ep-count-mal-down' : ''
            }`}
            title={badge.malDown ? MAL_DOWN_MESSAGE : undefined}
          >
            {badge.label}
          </span>
          <span className={`chevron ${open ? 'expanded' : ''}`}>▼</span>
        </div>
      </button>

      {open ? (
        <div className="show-row-body">
          {view.watchUrl || view.discussionUrl || view.malUrl ? (
            <div className="quick-links">
              {view.watchUrl ? (
                <a
                  className="btn btn-secondary btn-link"
                  href={view.watchUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {view.nextEpisodeToWatch !== null
                    ? `Watch ep ${view.nextEpisodeToWatch}`
                    : 'Watch'}
                </a>
              ) : null}
              {view.discussionUrl ? (
                <a
                  className="btn btn-secondary btn-link"
                  href={view.discussionUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Discussion
                </a>
              ) : null}
              {view.malUrl ? (
                <a
                  className="btn btn-secondary btn-link"
                  href={view.malUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  MAL
                </a>
              ) : null}
            </div>
          ) : null}

          {show.id && liveState ? (
            <div className="field">
              <label>Current episode</label>
              <div className="episode-stepper-row">
                <div
                  className="episode-stepper"
                  role="group"
                  aria-label="Current episode"
                  title={malBlocked ? MAL_DOWN_MESSAGE : undefined}
                >
                  <button
                    className="episode-stepper-btn"
                    type="button"
                    aria-label="Decrease episode"
                    disabled={
                      malBlocked ||
                      episodeSaving ||
                      currentEpisode === null ||
                      currentEpisode <= min
                    }
                    onClick={() => onAdjustEpisode(-1)}
                  >
                    −
                  </button>
                  <span className="episode-stepper-value">
                    {currentEpisode ?? '—'}
                  </span>
                  <button
                    className="episode-stepper-btn"
                    type="button"
                    aria-label="Increase episode"
                    disabled={
                      malBlocked ||
                      episodeSaving ||
                      currentEpisode === null ||
                      (max !== null && currentEpisode >= max)
                    }
                    onClick={() => onAdjustEpisode(1)}
                  >
                    +
                  </button>
                </div>
              </div>
              {malBlocked ? <p className="hint">{MAL_DOWN_MESSAGE}</p> : null}
            </div>
          ) : null}

          <ShowEditForm
            rowKey={row.key}
            show={show}
            startHint={view.startHint}
            malLinked={view.malLinked}
            malBlocked={malBlocked}
            malEditOpen={malEditOpen}
            completingShow={completingShow}
            holding={holding}
            onToggleMalEdit={() => setMalEditOpen((current) => !current)}
            {...handlers}
          />
        </div>
      ) : null}
    </article>
  )
}
