/** Show and state types shared by the checker and the admin app. */

export type ScheduleMode = 'finite' | 'ongoing'

export type ShowProvider = 'crunchyroll' | 'netflix' | 'disney'

export interface ShowSchedule {
  mode: ScheduleMode
  startAt: string
  startEpisode: number
  episodeCount: number | null
  premiereBatchSize: number
  /** Pauses in the schedule; manual breaks override AniList's airing times. */
  breaks?: ScheduleBreak[]
}

/**
 * Every episode after `afterEpisode` drops `weeks` weeks later. Where AniList
 * shows a gap after the same episode, the break counts once, for the longer
 * of the two, unless `onTopOfAniList` (added knowing AniList had the gap).
 */
export interface ScheduleBreak {
  afterEpisode: number
  weeks: number
  onTopOfAniList?: boolean
}

/** AniList's broadcast time (ISO) per episode number, saved by the checker. */
export interface AiringSchedule {
  fetchedAt: string
  episodes: Record<string, string>
}

/**
 * A break the show's official sources announced, not yet confirmed. `newDate`
 * is the new Japanese broadcast date (YYYY-MM-DD), or null while it's TBA.
 */
export interface AnnouncedBreak {
  episode: number
  newDate: string | null
  sourceUrl: string | null
  status: 'pending' | 'dismissed'
  announcedAt: string
}

export interface Show {
  id: string
  title: string
  titleEnglish?: string
  provider: ShowProvider
  crunchyrollUrl?: string
  seriesId?: string
  netflixUrl?: string
  netflixId?: string
  disneyUrl?: string
  disneyId?: string
  malId?: number
  redditSearchTitle?: string
  /** Overrides AniList's Official Site link when the news page lives elsewhere. */
  officialNewsUrl?: string
  schedule: ShowSchedule
}

export interface ShowsFile {
  shows: Show[]
}

export interface ShowState {
  lastEpisodeId: string
  lastEpisodeNumber: string
  lastEpisodeTitle: string
  lastNotifiedAt: string
  seasonId: string
  seasonTitle: string
  episodeOffset?: number | null
  waitingNotifiedForEpisode?: number | null
  /** Episode number of the latest episode snapshot seen for this show. */
  lastSnapshotEpisode?: number | null
  malMeanScore?: number | null
  malScoreAlertedAt?: string | null
  discussionUrl?: string | null
  discussionUrlEpisode?: number | null
  airingSchedule?: AiringSchedule
  /** AniList's Official Site link: null when AniList lists none, unset until checked. */
  officialSiteUrl?: string | null
  announcedBreak?: AnnouncedBreak | null
  /** Last announcement check attempt; the next is scheduled from it. */
  announcementCheckedAt?: string | null
  /** Last announcement check that read every news source the show has. */
  announcementReadAt?: string | null
  googleCalendarEvents?: Record<
    string,
    { eventId: string; startAt: string }
  > | null
}

export type PlanToWatchAlertReason = 'airing' | 'upcoming'

export interface PlanToWatchSnapshotEntry {
  malId: number
  title: string
  titleEnglish?: string
  status: string
  startDate: string | null
  broadcast: {
    dayOfWeek: string | null
    startTime: string | null
  } | null
  coverUrl: string | null
  numEpisodes: number | null
}

export interface PlanToWatchSnapshot {
  updatedAt: string
  entries: PlanToWatchSnapshotEntry[]
}

export interface OnHoldSnapshotEntry {
  show: Show
  heldAt: string
  /** Set when the show's broadcast is suspended: checked for its return. */
  awaitingReturn?: AwaitingReturn | null
}

export interface AwaitingReturn {
  /** The show's official news page, read alongside ANN; null for ANN only. */
  officialNewsUrl: string | null
  markedAt: string
}

/** What the news last said about a show awaiting return. */
export interface ReturnAnnouncement {
  /** The Japanese broadcast date it returns (YYYY-MM-DD), once exact. */
  returnsOn: string | null
  /** A rough time ("July 2027", "Summer 2027") until there's an exact date. */
  returnsIn: string | null
  /** The episode it returns with, when the news names one. */
  episode: number | null
  sourceUrl: string | null
  announcedAt: string
}

export interface OnHoldSnapshot {
  updatedAt: string
  entries: OnHoldSnapshotEntry[]
}

export interface StateFile {
  shows: Record<string, ShowState>
  meta?: {
    netflixCookieAlertSentAt?: string | null
    disneyCookieAlertSentAt?: string | null
    /** When the current MAL outage was first detected; null once it's back. */
    malDownSince?: string | null
    watchingDashboardMessageId?: string | null
    watchingDashboardMessageIds?: Record<string, string>
    watchingDashboardHashes?: Record<string, string>
    watchingDashboardScores?: Record<string, string>
    planToWatchCheckedAt?: string | null
    planToWatchAlerts?: Record<
      string,
      { alertedAt: string; reason: PlanToWatchAlertReason }
    >
    planToWatch?: PlanToWatchSnapshot
    relatedAnimeCheckedAt?: string | null
    /** Completed MAL ID -> related MAL IDs already seen (baseline + alerted). */
    relatedAnimeSeen?: Record<string, number[]>
    onHold?: OnHoldSnapshot
    /** Last daily check of the shows awaiting return. */
    returnCheckedAt?: string | null
    /** Show ID -> the last return announcement alerted. */
    returnAnnouncements?: Record<string, ReturnAnnouncement>
    redditUserFeeds?: Record<
      string,
      {
        seenPostIds: string[]
        checkedAt: string
        lastErrorAt?: string
        errorAlertSentAt?: string
        lastPostPublishedAt?: string
      }
    >
  }
}
