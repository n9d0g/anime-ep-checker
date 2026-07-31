import { sendPlanToWatchAlert } from './discord.js'
import type { DiscordConfig } from './discord.js'
import {
  fetchPlanToWatchAnime,
  type MalPlanToWatchEntry,
} from './mal.js'
import type {
  PlanToWatchAlertReason,
  PlanToWatchSnapshotEntry,
  StateFile,
} from './types.js'

const MS_PER_DAY = 24 * 60 * 60 * 1000
const UPCOMING_WINDOW_DAYS = 7

function hasBotConfig(discord: DiscordConfig): boolean {
  return Boolean(discord.botToken?.trim() && discord.channelId?.trim())
}

function hasDiscordConfig(discord: DiscordConfig): boolean {
  return hasBotConfig(discord) || Boolean(discord.webhookUrl?.trim())
}

function startOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  )
}

function parseStartDate(startDate: string): Date | null {
  const parsed = new Date(`${startDate}T00:00:00Z`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export function getPlanToWatchAlertReason(
  entry: MalPlanToWatchEntry,
  now: Date = new Date()
): PlanToWatchAlertReason | null {
  if (entry.status === 'currently_airing') {
    return 'airing'
  }

  if (entry.status !== 'not_yet_aired' || !entry.startDate) {
    return null
  }

  const start = parseStartDate(entry.startDate)
  if (!start) {
    return null
  }

  const today = startOfUtcDay(now)
  const windowEnd = new Date(
    today.getTime() + UPCOMING_WINDOW_DAYS * MS_PER_DAY
  )

  if (start.getTime() >= today.getTime() && start.getTime() <= windowEnd.getTime()) {
    return 'upcoming'
  }

  return null
}

function normalizeEntryForCompare(entry: PlanToWatchSnapshotEntry) {
  return {
    malId: entry.malId,
    title: entry.title,
    status: entry.status,
    startDate: entry.startDate,
    broadcast: entry.broadcast,
    numEpisodes: entry.numEpisodes,
  }
}

export function planToWatchEntriesMeaningfullyEqual(
  previous: PlanToWatchSnapshotEntry[] | undefined,
  next: PlanToWatchSnapshotEntry[]
): boolean {
  const sortByMalId = (
    a: ReturnType<typeof normalizeEntryForCompare>,
    b: ReturnType<typeof normalizeEntryForCompare>
  ) => a.malId - b.malId

  const prevNormalized = (previous ?? [])
    .map(normalizeEntryForCompare)
    .sort(sortByMalId)
  const nextNormalized = next.map(normalizeEntryForCompare).sort(sortByMalId)

  return JSON.stringify(prevNormalized) === JSON.stringify(nextNormalized)
}

export interface PlanToWatchSyncResult {
  changed: boolean
  reasons: string[]
}

export async function syncPlanToWatchAlerts({
  state,
  discord,
  now = new Date(),
  dryRun = false,
}: {
  state: StateFile
  discord: DiscordConfig
  now?: Date
  dryRun?: boolean
}): Promise<PlanToWatchSyncResult> {
  const reasons: string[] = []
  let changed = false

  const result = await fetchPlanToWatchAnime()
  const checkedAt = now.toISOString()

  if (result.status !== 'ok') {
    if (result.status === 'not_configured') {
      console.log('  MAL not configured; skipping plan-to-watch sync')
    } else {
      console.log('  MAL plan-to-watch list unavailable; skipping sync')
    }

    return { changed: false, reasons }
  }

  const currentMalIds = new Set(result.entries.map((entry) => String(entry.malId)))
  const previousAlerts = state.meta?.planToWatchAlerts ?? {}
  const nextAlerts: NonNullable<StateFile['meta']>['planToWatchAlerts'] = {}

  for (const [malId, alert] of Object.entries(previousAlerts)) {
    if (currentMalIds.has(malId)) {
      nextAlerts[malId] = alert
    }
  }

  if (JSON.stringify(nextAlerts) !== JSON.stringify(previousAlerts)) {
    changed = true
    reasons.push('pruned stale plan-to-watch alert state')
  }

  const snapshotEntries: PlanToWatchSnapshotEntry[] = result.entries.map(
    (entry) => ({
      malId: entry.malId,
      title: entry.title,
      status: entry.status,
      startDate: entry.startDate,
      broadcast: entry.broadcast,
      coverUrl: entry.coverUrl,
      numEpisodes: entry.numEpisodes,
    })
  )

  const entriesChanged = !planToWatchEntriesMeaningfullyEqual(
    state.meta?.planToWatch?.entries,
    snapshotEntries
  )

  if (entriesChanged) {
    changed = true
    reasons.push('plan-to-watch list updated')
  }

  for (const entry of result.entries) {
    const malId = String(entry.malId)
    if (nextAlerts[malId]) {
      continue
    }

    const reason = getPlanToWatchAlertReason(entry, now)
    if (!reason) {
      continue
    }

    if (!dryRun && hasDiscordConfig(discord)) {
      await sendPlanToWatchAlert({
        discord,
        entry,
        reason,
      })
      console.log(
        `  Plan-to-watch ${reason} alert for ${entry.title} (MAL ${entry.malId})`
      )
    } else if (dryRun) {
      console.log(
        `  Would send plan-to-watch ${reason} alert for ${entry.title} (MAL ${entry.malId})`
      )
      continue
    } else {
      console.log(
        `  Discord not configured; skipping plan-to-watch alert for ${entry.title}`
      )
      continue
    }

    nextAlerts[malId] = {
      alertedAt: now.toISOString(),
      reason,
    }
    changed = true
    reasons.push(`plan-to-watch ${entry.title} (${reason})`)
  }

  if (!dryRun && changed) {
    state.meta = {
      ...state.meta,
      planToWatchAlerts: nextAlerts,
      ...(entriesChanged
        ? {
            planToWatchCheckedAt: checkedAt,
            planToWatch: {
              updatedAt: checkedAt,
              entries: snapshotEntries,
            },
          }
        : {}),
    }
  }

  return { changed: dryRun ? false : changed, reasons }
}
