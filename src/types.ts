import type { ShowProvider } from '../shared/types.ts'

export interface SeasonEpisodeAvailability {
  episode: number
  availableAt: string | null
  available: boolean
}

export interface ProviderEpisode {
  id: string
  episode?: string | number
  title?: string
  availableAt?: string | null
}

export interface CrunchyrollEpisode {
  id: string
  episode?: string
  title?: string
  slug_title?: string
  premium_available_date?: string
  free_available_date?: string
  is_premium_only?: boolean
}

export interface CrunchyrollSeason {
  id: string
  title?: string
  season_sequence_number?: number
}

export interface EpisodeSnapshot {
  provider: ShowProvider
  seriesId: string
  seriesTitle: string
  seasonId: string
  seasonTitle: string
  episode: ProviderEpisode
  watchUrl: string
  seasonEpisodes?: SeasonEpisodeAvailability[]
}

export type TimingStatus = 'unknown' | 'on-time' | 'early' | 'late'
