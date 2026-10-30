// The per-show decisions of a check run, as pure functions: given a show, its
// saved state, the time and (once looked up) an episode snapshot, say what the
// run should do. `check.ts` performs the I/O for the returned action.
import {
  createBaselineState,
  createPreviousSeasonBaseline,
  createUpdatedState,
} from './compare.ts'
import { resolveEpisodeOffset, toRelativeSnapshot } from './episode-offset.ts'
import {
  getBroadcastAt,
  getDropWindowMode,
  getExpectedDropAt,
  getNextDrop,
  isPastWaitingGrace,
  parseEpisodeNumber,
  type DropWindowMode,
} from '../shared/schedule.ts'
import type { EpisodeSnapshot } from './types.ts'
import type { AiringSchedule, Show, ShowState } from '../shared/types.ts'

/** A next drop with a known expected time. */
export interface PlannedDrop {
  episode: number
  expectedAt: Date
}

/** Whether to look the show up on its provider this run. */
export type LookupPlan =
  | { kind: 'schedule_ended' }
  | { kind: 'no_expected_time'; episode: number }
  | { kind: 'outside_drop_window'; nextDrop: PlannedDrop }
  | {
      kind: 'look_up'
      nextDrop: PlannedDrop
      /** Null on forced runs, which ignore the drop window. */
      mode: DropWindowMode | null
    }

export function planShowLookup({
  show,
  previousState,
  now,
  force,
  airingSchedule = previousState?.airingSchedule,
}: {
  show: Show
  previousState: ShowState | null
  now: Date
  force: boolean
  /** The show's AniList airing schedule; defaults to the saved one. */
  airingSchedule?: AiringSchedule | null
}): LookupPlan {
  const next = getNextDrop(
    show.schedule,
    previousState?.lastEpisodeNumber,
    airingSchedule
  )
  if (!next) {
    return { kind: 'schedule_ended' }
  }
  if (!next.expectedAt) {
    return { kind: 'no_expected_time', episode: next.episode }
  }

  const nextDrop = { episode: next.episode, expectedAt: next.expectedAt }
  if (force) {
    return { kind: 'look_up', nextDrop, mode: null }
  }

  const mode = getDropWindowMode(nextDrop.expectedAt, now)
  if (!mode) {
    return { kind: 'outside_drop_window', nextDrop }
  }
  return { kind: 'look_up', nextDrop, mode }
}

/** What to do with a show after reading its episode snapshot. */
export type ShowDecision =
  /** First sight, and the provider only has last season: record that, no alert. */
  | { kind: 'previous_season_baseline'; state: ShowState }
  /** Tracked, and the provider still only has last season. */
  | { kind: 'previous_season_on_provider' }
  /** First sight, below the next drop: record the snapshot, no alert. */
  | {
      kind: 'baseline'
      snapshot: EpisodeSnapshot
      snapshotEpisode: number
      state: ShowState
    }
  /**
   * The next drop is out: alert `episodeNumber`, then save `state`. A catch-up
   * is the first sight of a show already at or past its next drop, and alerts
   * the snapshot's episode.
   */
  | {
      kind: 'episode_alert'
      catchUp: boolean
      episodeNumber: number
      expectedDropAt: string
      snapshot: EpisodeSnapshot
      snapshotEpisode: number
      state: ShowState
    }
  /** The next drop is 15+ minutes late: send the one still-waiting alert. */
  | {
      kind: 'still_waiting'
      episodeNumber: number
      expectedDropAt: string
      /** AniList's broadcast time if the episode has already aired (provider lag). */
      airedAt: string | null
      snapshotEpisode: number
      state: ShowState
    }
  /** The next drop isn't out yet and needs no alert. */
  | { kind: 'not_out_yet'; episodeNumber: number; snapshotEpisode: number }

type RelativeEpisodeResult =
  | { kind: 'previous_season' }
  | {
      kind: 'snapshot'
      snapshot: EpisodeSnapshot
      /** Offset to remember for this show; undefined when none was learned. */
      episodeOffset: number | undefined
    }

/** Renumbers the provider's snapshot to the show's season numbering. */
function toRelativeEpisodeResult(
  show: Show,
  previousState: ShowState | null,
  raw: EpisodeSnapshot
): RelativeEpisodeResult {
  // AniList's numbers already match the schedule; learning an offset from
  // them would also mis-number later provider snapshots.
  if (raw.seasonNumbered) {
    return { kind: 'snapshot', snapshot: raw, episodeOffset: undefined }
  }

  const knownOffset = previousState?.episodeOffset
  if (knownOffset != null) {
    return {
      kind: 'snapshot',
      snapshot: toRelativeSnapshot(raw, knownOffset),
      episodeOffset: knownOffset,
    }
  }

  const resolved = resolveEpisodeOffset(show, raw)
  if (resolved === null) {
    return { kind: 'previous_season' }
  }

  const snapshot = toRelativeSnapshot(raw, resolved)
  const relativeEpisode = parseEpisodeNumber(snapshot.episode.episode)
  if (relativeEpisode < show.schedule.startEpisode) {
    return { kind: 'previous_season' }
  }

  return { kind: 'snapshot', snapshot, episodeOffset: resolved }
}

export function decideShow({
  show,
  previousState,
  snapshot: providerSnapshot,
  nextDrop,
  now,
  airingSchedule = previousState?.airingSchedule,
}: {
  show: Show
  previousState: ShowState | null
  /** The provider's episode snapshot, in the provider's numbering. */
  snapshot: EpisodeSnapshot
  /** From `planShowLookup` for the same show and state. */
  nextDrop: PlannedDrop
  now: Date
  /** The show's AniList airing schedule; defaults to the saved one. */
  airingSchedule?: AiringSchedule | null
}): ShowDecision {
  const notifiedAt = now.toISOString()
  const relative = toRelativeEpisodeResult(
    show,
    previousState,
    providerSnapshot
  )

  if (relative.kind === 'previous_season') {
    return previousState
      ? { kind: 'previous_season_on_provider' }
      : {
          kind: 'previous_season_baseline',
          state: createPreviousSeasonBaseline(show, notifiedAt),
        }
  }

  const snapshot = relative.snapshot
  const snapshotEpisode = parseEpisodeNumber(snapshot.episode.episode)
  const episodeOffset =
    previousState?.episodeOffset == null ? relative.episodeOffset : undefined

  if (!previousState) {
    if (snapshotEpisode >= nextDrop.episode) {
      const expectedAt =
        getExpectedDropAt(show.schedule, snapshotEpisode, airingSchedule) ??
        nextDrop.expectedAt
      return {
        kind: 'episode_alert',
        catchUp: true,
        episodeNumber: snapshotEpisode,
        expectedDropAt: expectedAt.toISOString(),
        snapshot,
        snapshotEpisode,
        state: createUpdatedState(snapshot, snapshotEpisode, {
          notifiedAt,
          episodeOffset,
          previousState,
        }),
      }
    }

    return {
      kind: 'baseline',
      snapshot,
      snapshotEpisode,
      state: createBaselineState(snapshot, { notifiedAt, episodeOffset }),
    }
  }

  const expectedDropAt = nextDrop.expectedAt.toISOString()

  if (snapshotEpisode >= nextDrop.episode) {
    return {
      kind: 'episode_alert',
      catchUp: false,
      episodeNumber: nextDrop.episode,
      expectedDropAt,
      snapshot,
      snapshotEpisode,
      state: createUpdatedState(snapshot, nextDrop.episode, {
        notifiedAt,
        episodeOffset,
        previousState,
      }),
    }
  }

  if (
    isPastWaitingGrace(nextDrop.expectedAt, now) &&
    previousState.waitingNotifiedForEpisode !== nextDrop.episode
  ) {
    const broadcastAt = getBroadcastAt(airingSchedule, nextDrop.episode)
    return {
      kind: 'still_waiting',
      episodeNumber: nextDrop.episode,
      expectedDropAt,
      airedAt:
        broadcastAt && broadcastAt <= now ? broadcastAt.toISOString() : null,
      snapshotEpisode,
      state: { ...previousState, waitingNotifiedForEpisode: nextDrop.episode },
    }
  }

  return {
    kind: 'not_out_yet',
    episodeNumber: nextDrop.episode,
    snapshotEpisode,
  }
}
