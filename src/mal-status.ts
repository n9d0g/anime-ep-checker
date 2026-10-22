import { sendMalStatusAlert } from './discord.ts'
import type { DiscordConfig } from './discord.ts'
import { probeMalHealth, type MalHealth } from './mal.ts'
import type { StateFile } from './types.ts'

function hasDiscordConfig(discord: DiscordConfig): boolean {
  return Boolean(
    (discord.botToken?.trim() && discord.channelId?.trim()) ||
    discord.webhookUrl?.trim()
  )
}

export interface MalStatusSyncResult {
  changed: boolean
  reasons: string[]
}

/**
 * Sends one Discord alert when MAL goes down and one when it comes back,
 * using `meta.malDownSince` to remember an outage between runs.
 */
export async function syncMalStatusAlerts({
  state,
  discord,
  now = new Date(),
  dryRun = false,
  probe = probeMalHealth,
}: {
  state: StateFile
  discord: DiscordConfig
  now?: Date
  dryRun?: boolean
  probe?: () => Promise<MalHealth>
}): Promise<MalStatusSyncResult> {
  const health = await probe()
  if (health === 'not_configured') {
    return { changed: false, reasons: [] }
  }

  const downSince = state.meta?.malDownSince ?? null

  if (health === 'down' && !downSince) {
    const since = now.toISOString()
    if (dryRun) {
      console.log('  Would send MAL down alert')
    } else if (hasDiscordConfig(discord)) {
      await sendMalStatusAlert({ discord, status: 'down', downSince: since })
      console.log('  MAL down alert sent')
    } else {
      console.log('  Discord not configured; skipping MAL down alert')
    }

    state.meta = { ...state.meta, malDownSince: since }
    return { changed: true, reasons: ['MAL down alert'] }
  }

  if (health === 'up' && downSince) {
    if (dryRun) {
      console.log('  Would send MAL recovered alert')
    } else if (hasDiscordConfig(discord)) {
      await sendMalStatusAlert({ discord, status: 'up', downSince, now })
      console.log('  MAL recovered alert sent')
    } else {
      console.log('  Discord not configured; skipping MAL recovered alert')
    }

    state.meta = { ...state.meta, malDownSince: null }
    return { changed: true, reasons: ['MAL recovered alert'] }
  }

  if (health === 'down') {
    console.log(`  MAL still down (since ${downSince}); alert already sent`)
  }

  return { changed: false, reasons: [] }
}
