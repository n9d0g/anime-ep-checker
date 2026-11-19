'use client'

import { useState, type ComponentProps } from 'react'
import {
  SHEET_HERO_CLASS,
  SHEET_HERO_META_CLASS,
  SHEET_HERO_TITLE_CLASS,
  SHEET_LINKS_CLASS,
  Sheet,
  SheetActions,
  SheetSection,
} from '@/app/components/Sheet'
import { ProviderDot } from '@/app/components/ListRow'
import { ScheduleChipBadge } from '@/app/components/ScheduleChipBadge'
import { ShowEditForm } from '@/app/components/ShowEditForm'
import { ShowTitleDisplay } from '@/app/components/ShowTitleDisplay'
import type { EpisodeSaveStatus } from '@/app/components/useEpisodeProgress'
import type { DisplayRow } from '@/app/components/useWatchingShows'
import { getAnnouncedBreakSuggestion } from '@/lib/announced-break'
import { formatMalDate } from '@/lib/anime-format'
import { describeBreak } from '@/lib/schedule-break'
import { formScheduleToSchedule, MAL_DOWN_MESSAGE } from '@/lib/watching'
import { getOfficialNewsUrl } from '@shared/shows'
import type { ShowProvider } from '@shared/types'
import { FieldDescription } from '@/components/ui/field'
import { Button } from '@/components/ui/button'
import { cn } from '@/components/ui/utils'

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

const PROVIDER_LABELS: Record<ShowProvider, string> = {
  crunchyroll: 'Crunchyroll',
  netflix: 'Netflix',
  disney: 'Disney+',
}

const STEPPER_BUTTON_CLASS =
  'w-9 flex-[0_0_auto] cursor-pointer border-0 bg-transparent px-0 py-[0.45rem] text-[0.8rem] leading-none font-semibold text-(--muted) transition-[all] duration-100 ease-[ease] hover:not-disabled:bg-accent hover:not-disabled:text-foreground disabled:cursor-not-allowed disabled:opacity-45'

// One Watching show in a sheet: Watch (links and the episode stepper),
// Schedule (announced break, next drops, breaks), Setup (the saved fields)
// and Manage. A new show, not yet saved, has only Setup and Remove.
export function ShowSheet({
  displayRow,
  episodeStatus,
  completingShow,
  holding,
  focusField,
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
  /** A Setup field to open and focus, e.g. from an inbox action. */
  focusField?: 'official-news' | 'mal'
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
  'onUpdate' | 'onUpdateSchedule' | 'dirty' | 'saving' | 'onSave' | 'onRevert'
>) {
  const { row, index, liveState, view } = displayRow
  const show = row.values
  const [malEditOpen, setMalEditOpen] = useState(focusField === 'mal')

  // Opening on a Setup field (e.g. from an inbox action) focuses it.
  function focusSetupField(event: Event) {
    const field =
      focusField && document.getElementById(`${focusField}-${row.key}`)
    if (!field) {
      return
    }
    event.preventDefault()
    field.scrollIntoView({ block: 'center' })
    field.focus()
  }

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
    <Sheet title={title} onClose={onClose} onOpenAutoFocus={focusSetupField}>
      <div className={SHEET_HERO_CLASS}>
        <ShowTitleDisplay
          title={show.title || (show.id ? title : 'New show')}
          titleEnglish={show.titleEnglish}
          className={SHEET_HERO_TITLE_CLASS}
        />
        <p
          className={cn(
            SHEET_HERO_META_CLASS,
            'flex flex-wrap items-center gap-[0.45rem]'
          )}
        >
          <ProviderDot providerClass={view.providerDotClass} />
          {PROVIDER_LABELS[show.provider]}
          {view.chip ? <ScheduleChipBadge chip={view.chip} /> : null}
          <span
            className={
              view.badge.behind ? 'font-semibold text-(--warning)' : undefined
            }
          >
            {view.badge.label}
          </span>
        </p>
        {view.behindEpisodeLine ? (
          <p className={SHEET_HERO_META_CLASS}>{view.behindEpisodeLine}</p>
        ) : null}
        {!show.id ? (
          <FieldDescription>
            Fill in Setup, then save to start checking.
          </FieldDescription>
        ) : null}
      </div>

      {show.id ? (
        <SheetSection title="Watch">
          {view.watchUrl || view.discussionUrl || view.malUrl ? (
            <div className={SHEET_LINKS_CLASS}>
              {view.watchUrl ? (
                <Button asChild className="min-w-0 flex-1">
                  <a
                    href={view.watchUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {view.nextEpisodeToWatch !== null
                      ? `Watch ep ${view.nextEpisodeToWatch}`
                      : 'Watch'}
                  </a>
                </Button>
              ) : null}
              {view.discussionUrl ? (
                <Button asChild variant="outline" className="min-w-0 flex-1">
                  <a
                    href={view.discussionUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Discussion
                  </a>
                </Button>
              ) : null}
              {view.malUrl ? (
                <Button asChild variant="outline" className="min-w-0 flex-1">
                  <a
                    href={view.malUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    MAL
                  </a>
                </Button>
              ) : null}
            </div>
          ) : null}

          {liveState ? (
            <div className="flex w-full min-w-0 items-center gap-2">
              <span className="text-[0.82rem] text-(--text-secondary)">
                Current episode
              </span>
              <div
                className="flex w-full min-w-0 flex-1 items-stretch overflow-hidden rounded-md border border-border"
                role="group"
                aria-label="Current episode"
                title={malBlocked ? MAL_DOWN_MESSAGE : undefined}
              >
                <button
                  className={STEPPER_BUTTON_CLASS}
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
                <span className="flex min-w-0 flex-1 items-center justify-center border-x border-border px-2 py-[0.45rem] text-[0.88rem] font-semibold text-(--text-secondary) tabular-nums">
                  {currentEpisode ?? '—'}
                </span>
                <button
                  className={STEPPER_BUTTON_CLASS}
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
          {malBlocked ? (
            <FieldDescription>{MAL_DOWN_MESSAGE}</FieldDescription>
          ) : null}
        </SheetSection>
      ) : null}

      {show.id ? (
        <SheetSection title="Schedule">
          {announced ? (
            <div className="grid gap-[0.45rem] rounded-lg border border-[rgba(230,162,60,0.3)] bg-(--chip-amber-soft) px-[0.9rem] py-[0.8rem] text-[0.86rem]">
              <strong className="text-(--chip-amber)">
                ⚠️ Announced break
              </strong>
              <span>
                Episode {announced.episode} postponed:{' '}
                {announced.newDate
                  ? `new broadcast date ${formatMalDate(announced.newDate)} (JST)`
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
              <SheetActions className="justify-end">
                {suggestion ? (
                  <Button type="button" onClick={onConfirmAnnouncedBreak}>
                    Add {describeBreak(suggestion)}
                  </Button>
                ) : null}
                <Button
                  variant="outline"
                  type="button"
                  onClick={onDismissAnnouncedBreak}
                >
                  Dismiss
                </Button>
              </SheetActions>
            </div>
          ) : null}

          {view.upcomingDrops.length > 0 ? (
            <ol
              className="m-0 list-none p-0 text-[0.86rem]"
              aria-label="Next drops"
            >
              {view.upcomingDrops.map((drop) => (
                <li
                  key={drop.episode}
                  className="flex justify-between gap-4 py-[0.4rem] [&+&]:[border-top:1px_dashed_var(--border)]"
                >
                  <span>Ep {drop.episode}</span>
                  <span className="text-right text-(--text-secondary)">
                    {drop.when}
                  </span>
                </li>
              ))}
            </ol>
          ) : view.nextDropLine ? (
            <FieldDescription>{view.nextDropLine}</FieldDescription>
          ) : null}

          {show.schedule.breaks?.length ? (
            <ul
              className="mx-0 mt-2 mb-0 flex list-none flex-col gap-1 p-0 text-[0.85rem]"
              aria-label="Breaks"
            >
              {show.schedule.breaks.map((entry, breakIndex) => (
                <li
                  key={`${entry.afterEpisode}-${breakIndex}`}
                  className="flex items-center justify-between gap-2"
                >
                  <span>{capitalize(describeBreak(entry))}</span>
                  <Button
                    variant="link"
                    size="text"
                    type="button"
                    onClick={() => onRemoveBreak(breakIndex)}
                  >
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}

          <div className="mt-2 flex flex-col gap-[0.35rem]">
            <Button variant="outline" type="button" onClick={onAddBreak}>
              Add break
            </Button>
            <FieldDescription>
              Adds a 1-week break after the last dropped episode: later drops
              shift by 7 days, earlier ones stay, and Discord and Google
              Calendar events rebuild.
            </FieldDescription>
          </div>

          {noOfficialSource ? (
            <FieldDescription>
              No official source: break announcements are only read from Anime
              News Network. Set an official news URL under Setup.
            </FieldDescription>
          ) : null}
        </SheetSection>
      ) : null}

      <ShowEditForm
        rowKey={row.key}
        show={show}
        startHint={view.startHint}
        open={!show.id || Boolean(focusField)}
        malEditOpen={malEditOpen}
        officialSiteUrl={liveState?.officialSiteUrl}
        onToggleMalEdit={() => setMalEditOpen((current) => !current)}
        {...formHandlers}
      />

      <SheetSection title="Manage">
        <SheetActions>
          {show.id && view.malLinked ? (
            <>
              <Button
                variant="outline"
                type="button"
                disabled={holding || completingShow || malBlocked}
                title={malBlocked ? MAL_DOWN_MESSAGE : undefined}
                onClick={onHold}
              >
                {holding ? 'Saving…' : 'Put on hold'}
              </Button>
              <Button
                variant="outline"
                type="button"
                disabled={completingShow || malBlocked}
                title={malBlocked ? MAL_DOWN_MESSAGE : undefined}
                onClick={onComplete}
              >
                Mark as completed
              </Button>
            </>
          ) : null}
          <Button
            variant="destructive-link"
            size="inline"
            type="button"
            onClick={onRemove}
          >
            Remove show
          </Button>
        </SheetActions>
      </SheetSection>
    </Sheet>
  )
}
