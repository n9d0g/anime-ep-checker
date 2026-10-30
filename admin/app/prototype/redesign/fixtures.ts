// PROTOTYPE: fake data for /prototype/redesign. Times are relative to page
// load so "in 2d" and "Dropping now" always read right.

export type Provider = 'crunchyroll' | 'netflix' | 'disney'
export type Scenario = 'A' | 'B' | 'C'

export const SCENARIOS: { key: Scenario; name: string }[] = [
  { key: 'A', name: 'Typical week' },
  { key: 'B', name: 'Busy week, MAL down' },
  { key: 'C', name: 'Quiet week' },
]

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
export const WEEK = 7 * DAY

export interface AnnouncedBreak {
  episode: number
  newDateAt: number | null
  suggestionWeeks: number | null
  sourceUrl: string
}

export interface WatchingShow {
  id: string
  title: string
  titleEnglish: string
  provider: Provider
  hue: number
  watched: number
  latestDropped: number
  total: number | null
  nextDropAt: number
  announced: AnnouncedBreak | null
  providerLag: boolean
  stillWaiting: boolean
  breaks: { afterEpisode: number; weeks: number }[]
  officialNewsUrl: string | null
  malId: number | null
  redditTitle: string
  scheduleType: 'finite' | 'ongoing'
  startJst: string
  url: string
}

export interface OnHoldShow {
  id: string
  title: string
  titleEnglish: string
  provider: Provider
  hue: number
  since: number
  watched: number
}

export interface PtwShow {
  id: string
  title: string
  titleEnglish: string
  hue: number
  aired: boolean
  start: string | null
  episodes: number | null
  startedAiring: boolean
  mean: number | null
}

export interface WatchedShow {
  id: string
  title: string
  titleEnglish: string
  hue: number
  finishedAt: number
  score: number
  episodes: number
}

export interface Fixture {
  malDown: boolean
  watching: WatchingShow[]
  onHold: OnHoldShow[]
  ptw: PtwShow[]
  watched: WatchedShow[]
}

function kusuriya(now: number, scenario: Scenario): WatchingShow {
  return {
    id: 'kusuriya-3',
    title: 'Kusuriya no Hitorigoto 3rd Season',
    titleEnglish: 'The Apothecary Diaries Season 3',
    provider: 'crunchyroll',
    hue: 28,
    watched: scenario === 'C' ? 5 : 4,
    latestDropped: 5,
    total: 12,
    nextDropAt: now + 6 * DAY + 14 * HOUR,
    announced:
      scenario === 'C'
        ? null
        : {
            episode: 6,
            newDateAt: now + 13 * DAY + 14 * HOUR,
            suggestionWeeks: 1,
            sourceUrl: 'https://kusuriyanohitorigoto.jp/news/',
          },
    providerLag: false,
    stillWaiting: false,
    breaks: [],
    officialNewsUrl: 'https://kusuriyanohitorigoto.jp/news/',
    malId: 61987,
    redditTitle: '',
    scheduleType: 'finite',
    startJst: '2026-10-03T00:00',
    url: 'https://crunchyroll.com/series/G4PH0WEKE',
  }
}

function aoNoHako(now: number, scenario: Scenario): WatchingShow {
  const dropAt =
    scenario === 'A'
      ? now + 20 * 60 * 1000
      : scenario === 'B'
        ? now - 35 * 60 * 1000
        : now + 2 * DAY + 4 * HOUR
  return {
    id: 'ao-no-hako-2',
    title: 'Ao no Hako Season 2',
    titleEnglish: 'Blue Box Season 2',
    provider: 'netflix',
    hue: 210,
    watched: 4,
    latestDropped: 4,
    total: 12,
    nextDropAt: dropAt,
    announced: null,
    providerLag: false,
    stillWaiting: scenario === 'B',
    breaks: [{ afterEpisode: 4, weeks: 1 }],
    officialNewsUrl: scenario === 'C' ? 'https://aonohako-anime.com/news' : null,
    malId: 60031,
    redditTitle: '',
    scheduleType: 'finite',
    startJst: '2026-10-04T02:30',
    url: 'https://www.netflix.com/title/81960123',
  }
}

function sakamoto(now: number, scenario: Scenario): WatchingShow {
  return {
    id: 'sakamoto-days-2',
    title: 'Sakamoto Days 2nd Season',
    titleEnglish: 'Sakamoto Days Season 2',
    provider: 'netflix',
    hue: 350,
    watched: 3,
    latestDropped: 3,
    total: 11,
    nextDropAt:
      scenario === 'B' ? now - 3 * HOUR : now + 3 * DAY + 9 * HOUR,
    announced: null,
    providerLag: scenario === 'B',
    stillWaiting: false,
    breaks: scenario === 'B' ? [] : [{ afterEpisode: 3, weeks: 2 }],
    officialNewsUrl: 'https://sakamotodays.jp/news/',
    malId: scenario === 'B' ? null : 61200,
    redditTitle: '',
    scheduleType: 'finite',
    startJst: '2026-10-06T23:00',
    url: 'https://www.netflix.com/title/81891234',
  }
}

function dandadan(now: number): WatchingShow {
  return {
    id: 'dandadan-3',
    title: 'Dandadan 3rd Season',
    titleEnglish: 'Dan Da Dan Season 3',
    provider: 'crunchyroll',
    hue: 140,
    watched: 1,
    latestDropped: 2,
    total: 12,
    nextDropAt: now + 4 * DAY + 2 * HOUR,
    announced: null,
    providerLag: false,
    stillWaiting: false,
    breaks: [],
    officialNewsUrl: 'https://anime-dandadan.com/news/',
    malId: 62001,
    redditTitle: '',
    scheduleType: 'finite',
    startJst: '2026-10-23T00:26',
    url: 'https://crunchyroll.com/series/GG5H5XQ0D',
  }
}

const PTW_UPCOMING: [string, string, string | null][] = [
  ['Kusuriya no Hitorigoto Movie: Bouhi no Hihou', 'The Apothecary Diaries Movie', '2026-12-11'],
  ['Boku no Kokoro no Yabai Yatsu 3rd Season', 'The Dangers in My Heart Season 3', '2027'],
  ['Kaijuu 8-gou Movie', 'Kaiju No. 8: The Final Mission', '2027'],
  ['Kono Subarashii Sekai ni Shukufuku wo! 4', 'KonoSuba 4', '2027'],
  ['Sakamoto Days 3rd Season', 'Sakamoto Days Season 3', '2027-01'],
  ['Kininatteru Hito ga Otoko ja Nakatta', "The Guy She Was Interested in Wasn't a Guy at All", '2027-01-08'],
  ['Kusuriya no Hitorigoto 3rd Season Part 2', 'The Apothecary Diaries Season 3 Part 2', '2027-04'],
  ['Dungeon Meshi Season 2', 'Delicious in Dungeon Season 2', '2027-10'],
  ['Sousou no Frieren: Ougonkyou-hen', "Frieren: Beyond Journey's End - Golden Land Arc", '2027-10'],
  ['[Oshi no Ko] 4th Season', '[Oshi No Ko] Season 4', null],
  ['Bocchi the Rock! 2nd Season', 'Bocchi the Rock! Season 2', null],
  ['Chainsaw Man: Shikaku-hen', "Chainsaw Man: Assassins Arc", null],
  ['Make Heroine ga Oosugiru! 2nd Season', 'Makeine Season 2', null],
]

const PTW_AIRED: [string, string, string, number][] = [
  ['Apocalypse Hotel', '', '2025-04-09', 12],
  ['Banana Fish', '', '2018-07-06', 24],
  ['Boku dake ga Inai Machi', 'Erased', '2016-01-08', 12],
  ['Byousoku 5 Centimeter', '5 Centimeters per Second', '2007-03-03', 3],
  ['Kanata no Astra', 'Astra Lost in Space', '2019-07-03', 12],
  ['Kotarou wa Hitorigurashi', 'Kotaro Lives Alone', '2022-03-10', 10],
  ['Orange', '', '2016-07-04', 13],
  ['Tengoku Daimakyou', 'Heavenly Delusion', '2023-04-01', 13],
  ['Tenmaku no Jaadugar', 'Jaadugar: A Witch in Mongolia', '2026-07-04', 12],
  ['Violet Evergarden Movie', 'Violet Evergarden: The Movie', '2020-09-18', 1],
  ['Wotaku ni Koi wa Muzukashii', 'Wotakoi: Love is Hard for Otaku', '2018-04-13', 11],
]

const WATCHED: [string, string, number, number, number][] = [
  ['Bleach: Sennen Kessen-hen - Kashin-tan', 'Bleach: TYBW - The Calamity', 2026, 9, 13],
  ['Cyberpunk: Edgerunners 2', '', 2026, 8, 10],
  ['Kusuriya no Hitorigoto 2nd Season', 'The Apothecary Diaries Season 2', 2026, 9, 24],
  ['Ore dake Level Up na Ken Season 2', 'Solo Leveling Season 2', 2026, 7, 13],
  ['Dandadan 2nd Season', 'Dan Da Dan Season 2', 2026, 8, 12],
  ['Kaijuu 8-gou 2nd Season', 'Kaiju No. 8 Season 2', 2026, 7, 11],
  ['Ao no Hako', 'Blue Box', 2025, 9, 25],
  ['Sakamoto Days', '', 2025, 7, 11],
  ['Kusuriya no Hitorigoto', 'The Apothecary Diaries', 2025, 10, 24],
  ['Dandadan', 'Dan Da Dan', 2025, 9, 12],
  ['Sousou no Frieren', "Frieren: Beyond Journey's End", 2025, 10, 28],
  ['Make Heroine ga Oosugiru!', 'Too Many Losing Heroines!', 2025, 8, 12],
  ['Oshi no Ko 2nd Season', '[Oshi No Ko] Season 2', 2025, 8, 13],
  ['Kimi no Koto ga Daidaidaidaidaisuki na 100-nin no Kanojo', 'The 100 Girlfriends', 2025, 7, 12],
  ['Bocchi the Rock!', '', 2024, 10, 12],
  ['Chainsaw Man', '', 2024, 8, 12],
  ['Spy x Family', '', 2024, 8, 25],
  ['Dungeon Meshi', 'Delicious in Dungeon', 2024, 9, 24],
  ['Vinland Saga Season 2', '', 2024, 9, 24],
  ['Jujutsu Kaisen 2nd Season', 'Jujutsu Kaisen Season 2', 2024, 8, 23],
  ['Mob Psycho 100 III', '', 2023, 9, 12],
  ['Cyberpunk: Edgerunners', '', 2023, 9, 10],
  ['Kaguya-sama wa Kokurasetai: Ultra Romantic', 'Kaguya-sama: Love is War -Ultra Romantic-', 2023, 9, 13],
  ['Odd Taxi', '', 2023, 9, 13],
  ['Mushishi', '', 2022, 9, 26],
  ['Steins;Gate', '', 2022, 10, 24],
  ['Hyouka', '', 2022, 8, 22],
]

function slug(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-')
}

export function buildFixture(scenario: Scenario, now: number): Fixture {
  const watching = [kusuriya(now, scenario), aoNoHako(now, scenario), sakamoto(now, scenario)]
  if (scenario === 'B') watching.push(dandadan(now))

  const ptw: PtwShow[] = [
    ...PTW_UPCOMING.map(([title, titleEnglish, start], index) => ({
      id: slug(title),
      title,
      titleEnglish,
      hue: (index * 47) % 360,
      aired: false,
      start,
      episodes: null,
      startedAiring: false,
      mean: null,
    })),
    ...PTW_AIRED.map(([title, titleEnglish, start, episodes], index) => ({
      id: slug(title),
      title,
      titleEnglish,
      hue: (index * 61 + 20) % 360,
      aired: true,
      start,
      episodes,
      startedAiring: false,
      mean: 7.4 + ((index * 13) % 15) / 10,
    })),
  ]
  if (scenario === 'B') {
    ptw.unshift({
      id: 'witch-hat-atelier',
      title: 'Tongari Boushi no Atelier',
      titleEnglish: 'Witch Hat Atelier',
      hue: 265,
      aired: false,
      start: '2026-10-28',
      episodes: 12,
      startedAiring: true,
      mean: 8.6,
    })
  }

  return {
    malDown: scenario === 'B',
    watching,
    onHold: [
      {
        id: 'one-piece',
        title: 'One Piece',
        titleEnglish: '',
        provider: 'crunchyroll',
        hue: 15,
        since: now - 32 * DAY,
        watched: 1122,
      },
    ],
    ptw,
    watched: WATCHED.map(([title, titleEnglish, year, score, episodes], index) => ({
      id: slug(title),
      title,
      titleEnglish,
      hue: (index * 37) % 360,
      finishedAt: Math.min(Date.UTC(year, 11 - (index % 11), 1 + (index % 27)), now - (index + 1) * 9 * DAY),
      score,
      episodes,
    })),
  }
}
