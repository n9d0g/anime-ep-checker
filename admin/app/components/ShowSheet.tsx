'use client'

import { useState, type ComponentProps, type ReactNode } from 'react'
import { Sheet } from '@/app/components/Sheet'
import { ShowEditForm } from '@/app/components/ShowEditForm'
import { ShowTitleDisplay } from '@/app/components/ShowTitleDisplay'
import type { EpisodeSaveStatus } from '@/app/components/useEpisodeProgress'
import type { DisplayRow } from '@/app/components/useWatchingShows'
import { getAnnouncedBreakSuggestion } from '@/lib/announced-break'
import { describeBreak } from '@/lib/schedule-break'
import { formScheduleToSchedule, MAL_DOWN_MESSAGE } from '@/lib/watching'
import { getOfficialNewsUrl } from '@shared/shows'
import type { ShowProvider } from '@shared/types'

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function SheetSection({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <section className="sheet-section">
      <h3 className="sheet-section-title">{title}</h3>
      {children}
    </section>
  )
}

const PROVIDER_LABELS: Record<ShowProvider, string> = {
  crunchyroll: 'Crunchyroll',
  netflix: 'Netflix',
  disney: 'Disney+',
}

// One Watching show in a sheet: Watch (links and the episode stepper),
// Schedule (announced break, next drops, breaks), Setup (the saved fields)
// and Manage. A new show, not yet saved, has only Setup and Remove.
export function ShowSheet({
  displayRow,
  episodeStatus,
  completingShow,
  holding,
  onClose,
  onAdjustEpisode,
  onAddBreak,
  onRemoveBreak,
  onConfirmAnnouncedBreak,
  onDismissAnnouncedBreak,
  onComplete,
  onHold,
  onRemove,
  ...formHandlers
}: {
  displayRow: DisplayRow
  episodeStatus: EpisodeSaveStatus
  completingShow: boolean
  holding: boolean
  onClose: () => void
  onAdjustEpisode: (delta: number) => void
  onAddBreak: () => void
  onRemoveBreak: (index: number) => void
  onConfirmAnnouncedBreak: () => void
  onDismissAnnouncedBreak: () => void
  onComplete: () => void
  onHold: () => void
  onRemove: () => void
} & Pick<
  ComponentProps<typeof ShowEditForm>,
  'onUpdate' | 'onUpdateSchedule'
>) {
  const { row, index, liveState, view } = displayRow
  const show = row.values
  const [malEditOpen, setMalEditOpen] = useState(false)
  const title = show.title || `Show ${index + 1}`
  const episodeSaving = episodeStatus === 'saving'
  const { currentEpisode, malBlocked } = view
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
    <Sheet title={title} onClose={onClose}>
      <div className="sheet-hero">
        <ShowTitleDisplay
          title={show.title || (show.id ? title : 'New show')}
          titleEnglish={show.titleEnglish}
          className="sheet-hero-title"
        />
        <p className="sheet-hero-meta">
          <span
            className={`provider-dot ${view.providerDotClass}`}
            aria-hidden="true"
          />
          {PROVIDER_LABELS[show.provider]}
          {view.chip ? (
            <span className={`chip chip-${view.chip.kind}`}>
              {view.chip.label}
            </span>
          ) : null}
          <span className={view.badge.behind ? 'ep-count-behind' : undefined}>
            {view.badge.label}
          </span>
        </p>
        {!show.id ? (
          <p className="hint">Fill in Setup, then save to start checking.</p>
        ) : null}
      </div>

      {show.id ? (
        <SheetSection title="Watch">
          {view.watchUrl || view.discussionUrl || view.malUrl ? (
            <div className="quick-links">
              {view.watchUrl ? (
                <a
                  className="btn btn-link"
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

          {liveState ? (
            <div className="episode-stepper-row">
              <span className="sheet-label">Current episode</span>
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
          ) : null}
          {malBlocked ? <p className="hint">{MAL_DOWN_MESSAGE}</p> : null}
        </SheetSection>
      ) : null}

      {show.id ? (
        <SheetSection title="Schedule">
          {announced ? (
            <div className="sheet-callout">
              <strong>⚠️ Announced break</strong>
              <span>
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
                  ? ' · Not a whole-week break; add one below if needed.'
                  : null}
              </span>
              <div className="actions">
                {suggestion ? (
                  <button
                    className="btn"
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

          {view.upcomingDrops.length > 0 ? (
            <ol className="drop-list" aria-label="Next drops">
              {view.upcomingDrops.map((drop) => (
                <li key={drop.episode}>
                  <span>Ep {drop.episode}</span>
                  <span>{drop.when}</span>
                </li>
              ))}
            </ol>
          ) : view.nextDropLine ? (
            <p className="hint">{view.nextDropLine}</p>
          ) : null}

          {show.schedule.breaks?.length ? (
            <ul className="break-list" aria-label="Breaks">
              {show.schedule.breaks.map((entry, breakIndex) => (
                <li key={`${entry.afterEpisode}-${breakIndex}`}>
                  <span>{capitalize(describeBreak(entry))}</span>
                  <button
                    className="text-btn"
                    type="button"
                    onClick={() => onRemoveBreak(breakIndex)}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          <div className="break-actions">
            <button
              className="btn btn-secondary"
              type="button"
              onClick={onAddBreak}
            >
              Add break
            </button>
            <p className="hint">
              Adds a 1-week break after the last dropped episode: later drops
              shift by 7 days, earlier ones stay, and Discord and Google
              Calendar events rebuild.
            </p>
          </div>

          {noOfficialSource ? (
            <p className="hint">
              No official source: break announcements are only read from Anime
              News Network. Set an official news URL under Setup.
            </p>
          ) : null}
        </SheetSection>
      ) : null}

      <ShowEditForm
        rowKey={row.key}
        show={show}
        startHint={view.startHint}
        malEditOpen={malEditOpen}
        officialSiteUrl={liveState?.officialSiteUrl}
        onToggleMalEdit={() => setMalEditOpen((current) => !current)}
        {...formHandlers}
      />

      <SheetSection title="Manage">
        <div className="actions sheet-manage">
          {show.id && view.malLinked ? (
            <>
              <button
                className="btn btn-secondary"
                type="button"
                disabled={holding || completingShow || malBlocked}
                title={malBlocked ? MAL_DOWN_MESSAGE : undefined}
                onClick={onHold}
              >
                {holding ? 'Saving…' : 'Put on hold'}
              </button>
              <button
                className="btn btn-secondary"
                type="button"
                disabled={completingShow || malBlocked}
                title={malBlocked ? MAL_DOWN_MESSAGE : undefined}
                onClick={onComplete}
              >
                Mark as completed
              </button>
            </>
          ) : null}
          <button className="btn btn-danger" type="button" onClick={onRemove}>
            Remove show
          </button>
        </div>
      </SheetSection>
    </Sheet>
  )
}
