import type { PlanToWatchSnapshotEntry } from './types.ts'

/** MAL list fields a plan-to-watch snapshot entry is built from. */
export const PLAN_TO_WATCH_LIST_FIELDS = [
  'list_status',
  'num_episodes',
  'start_date',
  'broadcast',
  'main_picture',
  'status',
  'alternative_titles',
]

export interface MalPlanToWatchNode {
  id: number
  title: string
  alternative_titles?: {
    en?: string
    ja?: string
    synonyms?: string[]
  }
  status?: string
  start_date?: string
  num_episodes?: number
  main_picture?: { medium?: string; large?: string }
  broadcast?: {
    day_of_the_week?: string
    start_time?: string
  }
}

export interface MalPlanToWatchPage<Node extends MalPlanToWatchNode> {
  data?: Array<{ node: Node; list_status?: { updated_at?: string } }>
  paging?: { next?: string }
}

export function parsePlanToWatchEntry(
  node: MalPlanToWatchNode
): PlanToWatchSnapshotEntry {
  const broadcast = node.broadcast
    ? {
        dayOfWeek: node.broadcast.day_of_the_week ?? null,
        startTime: node.broadcast.start_time ?? null,
      }
    : null

  const titleEnglish = node.alternative_titles?.en?.trim() || undefined

  return {
    malId: node.id,
    title: node.title,
    titleEnglish,
    status: node.status ?? '',
    startDate: node.start_date ?? null,
    broadcast,
    coverUrl: node.main_picture?.large ?? node.main_picture?.medium ?? null,
    numEpisodes:
      typeof node.num_episodes === 'number' && node.num_episodes > 0
        ? node.num_episodes
        : null,
  }
}

/** Snapshot entries from one MAL list page, skipping entries without an ID. */
export function parsePlanToWatchPage(
  page: MalPlanToWatchPage<MalPlanToWatchNode>
): PlanToWatchSnapshotEntry[] {
  return (page.data ?? [])
    .filter((item) => item.node?.id)
    .map((item) => parsePlanToWatchEntry(item.node))
}
