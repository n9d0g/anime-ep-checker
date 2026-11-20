// The Episode code (s3e8, s2p1e3): a show's season, its part when it names
// one, and the episode, read from the show title unless shows.json overrides
// them. See GLOSSARY.md.

import type { Show } from './types.ts'

const ORDINAL = '(\\d+)(?:st|nd|rd|th)'
const ROMAN = '([ivx]+)'

const SEASON_PATTERNS = [
  new RegExp(`\\b${ORDINAL}\\s+season\\b`, 'i'),
  /\bseason\s*(\d+)\b/i,
  /\bs(\d+)\b/i,
]

const PART_PATTERNS = [
  new RegExp(`\\b${ORDINAL}\\s+(?:part|cour)\\b`, 'i'),
  new RegExp(`\\b(?:part|cour)\\s*(\\d+|${ROMAN})\\b`, 'i'),
]

const ROMAN_VALUES: Record<string, number> = { i: 1, v: 5, x: 10 }

function romanToNumber(text: string): number | null {
  let total = 0
  const letters = text.toLowerCase()
  for (let index = 0; index < letters.length; index++) {
    const value = ROMAN_VALUES[letters[index]]
    const next = ROMAN_VALUES[letters[index + 1]] ?? 0
    if (!value) return null
    total += value < next ? -value : value
  }
  return total > 0 ? total : null
}

function parseNumber(text: string): number | null {
  const value = /^\d+$/.test(text) ? Number(text) : romanToNumber(text)
  return value && value > 0 ? value : null
}

/** Removes the first phrase a pattern matches, returning its number. */
function takePhrase(
  title: string,
  patterns: RegExp[]
): { title: string; value: number | null } {
  for (const pattern of patterns) {
    const match = pattern.exec(title)
    const value = match ? parseNumber(match[1]) : null
    if (match && value) {
      return {
        title:
          title.slice(0, match.index) +
          title.slice(match.index + match[0].length),
        value,
      }
    }
  }
  return { title, value: null }
}

function tidyTitle(title: string): string {
  return title
    .replace(/\(\s*\)|\[\s*\]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+([:,])/g, '$1')
    .replace(/[\s:,\-–—]+$/, '')
    .trim()
}

export interface SeasonAndPart {
  /** The title with its season and part phrases removed. */
  title: string
  season: number | null
  part: number | null
}

/** Reads the season and part a title names, removing those phrases from it. */
export function parseSeasonAndPart(title: string): SeasonAndPart {
  const season = takePhrase(title, SEASON_PATTERNS)
  const part = takePhrase(season.title, PART_PATTERNS)
  const tidied = tidyTitle(part.title)
  return {
    title: tidied || title.trim(),
    season: season.value,
    part: part.value,
  }
}

export type EpisodeCodeShow = Pick<Show, 'id' | 'title' | 'season' | 'part'>

/** The show title without season or part phrases, and its Episode code. */
export function getEpisodeLabelParts(
  show: EpisodeCodeShow,
  episodeNumber: number
): { showTitle: string; episodeCode: string } {
  const parsed = parseSeasonAndPart(show.title || show.id)
  const season = show.season ?? parsed.season ?? 1
  const part = show.part ?? parsed.part
  return {
    showTitle: parsed.title,
    episodeCode: `s${season}${part ? `p${part}` : ''}e${episodeNumber}`,
  }
}

/** "Kusuriya no Hitorigoto s3e8": the show and its Episode code together. */
export function formatEpisodeLabel(
  show: EpisodeCodeShow,
  episodeNumber: number
): string {
  const { showTitle, episodeCode } = getEpisodeLabelParts(show, episodeNumber)
  return `${showTitle} ${episodeCode}`
}
