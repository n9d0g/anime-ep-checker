'use client'

import { useState, type ComponentProps } from 'react'
import { ExpandableRowHeader } from '@/app/components/ExpandableRowHeader'
import { ShowEditForm } from '@/app/components/ShowEditForm'
import { ShowTitleDisplay } from '@/app/components/ShowTitleDisplay'
import type { EpisodeSaveStatus } from '@/app/components/useEpisodeProgress'
import type { DisplayRow } from '@/app/components/useWatchingShows'
import { getAnnouncedBreakSuggestion } from '@/lib/announced-break'
import { formScheduleToSchedule, MAL_DOWN_MESSAGE } from '@/lib/watching'
import { describeBreak } from '@/lib/schedule-break'
import { getOfficialNewsUrl } from '@shared/shows'

type EditFormHandlers = Pick<
  ComponentProps<typeof ShowEditForm>,
  | 'onUpdate'
  | 'onUpdateSchedule'
  | 'onAddBreak'
  | 'onRemoveBreak'
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
  onConfirmAnnouncedBreak,
  onDismissAnnouncedBreak,
  ...handlers
}: {
  displayRow: DisplayRow
  episodeStatus: EpisodeSaveStatus
  completingShow: boolean
  holding: boolean
  onAdjustEpisode: (delta: number) => void
  onConfirmAnnouncedBreak: () => void
  onDismissAnnouncedBreak: () => void
} & EditFormHandlers) {
  const { row, index, liveState, view } = displayRow
  const show = row.values
  const [open, setOpen] = useState(() => !show.id)
  const [malEditOpen, setMalEditOpen] = useState(false)
  const episodeSaving = episodeStatus === 'saving'
  const { currentEpisode, badge, malBlocked } = view
  const { min, max } = view.bounds
  const announced =
    liveState?.announcedBreak?.status === 'pending'
      ? liveState.announcedBreak
      : null
  const suggestion = announced
    ? getAnnouncedBreakSuggestion(
        formScheduleToSchedule(show),
        announced,
        liveState?.airingSchedule
      )
    : null
  // Null from AniList means it was checked and lists no official site.
  const noOfficialSource =
    Boolean(show.id) &&
    liveState?.officialSiteUrl === null &&
    !getOfficialNewsUrl(show, null)

  return (
    <article
      id={show.id ? `show-${show.id}` : undefined}
      className={`show-row${open ? ' expanded' : ''}`}
    >
      <ExpandableRowHeader
        open={open}
        onToggle={() => setOpen((current) => !current)}
        leading={
          <>
            <span
              className={`provider-dot ${view.providerDotClass}`}
              aria-hidden="true"
            />
            <ShowTitleDisplay
              title={show.title || `Show ${index + 1}`}
              titleEnglish={show.titleEnglish}
              belowSubtitle={
                view.nextDropLine || view.chip ? (
                  <span className="show-row-next-episode">
                    {view.chip ? (
                      <span className={`chip chip-${view.chip.kind}`}>
                        {view.chip.label}
                      </span>
                    ) : null}
                    {view.nextDropLine ? (
                      <span className="show-row-next-drop">
                        {view.nextDropLine}
                      </span>
                    ) : null}
                  </span>
                ) : null
              }
            />
          </>
        }
        trailing={
          <span
            className={`ep-count${badge.behind ? ' ep-count-behind' : ''}${
              badge.malDown ? ' ep-count-mal-down' : ''
            }`}
            title={badge.malDown ? MAL_DOWN_MESSAGE : undefined}
          >
            {badge.label}
          </span>
        }
      />

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

          {show.id && announced ? (
            <div className="field">
              <label>⚠️ Announced break</label>
              <p className="hint">
                Episode {announced.episode} postponed:{' '}
                {announced.newDate
                  ? `new broadcast date ${announced.newDate} (JST)`
                  : 'new date TBA'}
                {announced.sourceUrl ? (
                  <>
                    {' · '}
                    <a
                      href={announced.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Source
                    </a>
                  </>
                ) : null}
                {announced.newDate && !suggestion
                  ? ' · Not a whole-week break; add one under More options if needed.'
                  : null}
              </p>
              <div className="actions">
                {suggestion ? (
                  <button
                    className="btn btn-secondary"
                    type="button"
                    onClick={onConfirmAnnouncedBreak}
                  >
                    Add {describeBreak(suggestion)}
                  </button>
                ) : null}
                <button
                  className="btn btn-secondary"
                  type="button"
                  onClick={onDismissAnnouncedBreak}
                >
                  Dismiss
                </button>
              </div>
            </div>
          ) : null}

          {noOfficialSource ? (
            <p className="hint">
              No official source: break announcements are only read from Anime
              News Network. Set an official news URL under More options.
            </p>
          ) : null}

          <ShowEditForm
            rowKey={row.key}
            show={show}
            startHint={view.startHint}
            malLinked={view.malLinked}
            malBlocked={malBlocked}
            malEditOpen={malEditOpen}
            officialSiteUrl={liveState?.officialSiteUrl}
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
