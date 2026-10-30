'use client'

// PROTOTYPE: the agreed admin redesign (inbox + compact rows with chips, tab
// bar, detail sheet, per-show save) on fake data. The design is settled, so
// `?variant=` switches data scenarios, not designs. Nothing here touches
// GitHub or MAL; every action is in-memory. Throw away once judged.
import {
  createContext,
  Suspense,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { PrototypeSwitcher } from '@/app/components/PrototypeSwitcher'
import {
  buildFixture,
  SCENARIOS,
  WEEK,
  type Fixture,
  type OnHoldShow,
  type Provider,
  type PtwShow,
  type Scenario,
  type WatchedShow,
  type WatchingShow,
} from './fixtures'
import ANIME_JSON from './anime.json'
import './prototype.css'

const NOW = Date.now()
const ET = 'America/New_York'
const DAY = 24 * 60 * 60 * 1000

// ── Dates: Eastern Time everywhere, relative within a week ────────────────

function relative(ms: number): string {
  const diff = ms - NOW
  const abs = Math.abs(diff)
  const amount =
    abs < 60 * 60 * 1000
      ? `${Math.max(1, Math.round(abs / 60000))}m`
      : abs < DAY
        ? `${Math.round(abs / (60 * 60 * 1000))}h`
        : `${Math.round(abs / DAY)}d`
  return diff >= 0 ? `in ${amount}` : `${amount} ago`
}

function dayTime(ms: number): string {
  return `${new Intl.DateTimeFormat('en-US', {
    timeZone: ET,
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(ms)} ET`
}

function monthDay(ms: number): string {
  const sameYear =
    new Date(ms).getUTCFullYear() === new Date(NOW).getUTCFullYear()
  return new Intl.DateTimeFormat('en-US', {
    timeZone: ET,
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  }).format(ms)
}

function when(ms: number): string {
  return Math.abs(ms - NOW) < 7 * DAY
    ? `${relative(ms)} · ${dayTime(ms)}`
    : monthDay(ms)
}

function malDate(value: string | null): string {
  if (!value) return 'TBA'
  if (/^\d{4}$/.test(value)) return value
  const [y, m, d] = value.split('-').map(Number)
  if (!d) {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(Date.UTC(y, m - 1, 1))
  }
  return monthDay(Date.UTC(y, m - 1, d, 12))
}

// ── Chips: one schedule chip per row, glossary words, fixed priority ──────

type Chip = { label: string; tone: 'amber' | 'blue' | 'grey' }

function scheduleChip(show: WatchingShow): Chip | null {
  if (show.announced) return { label: 'Announced break', tone: 'amber' }
  if (show.providerLag) return { label: 'Provider lag', tone: 'grey' }
  if (show.stillWaiting) return { label: 'Still waiting', tone: 'amber' }
  const sinceDrop = NOW - show.nextDropAt
  if (sinceDrop > -5 * 60 * 1000 && sinceDrop < 90 * 60 * 1000) {
    return { label: 'Dropping now', tone: 'blue' }
  }
  const upcomingBreak = show.breaks.find(
    (b) => b.afterEpisode >= show.latestDropped - 1
  )
  if (upcomingBreak) {
    return { label: `Break +${upcomingBreak.weeks}w`, tone: 'grey' }
  }
  return null
}

function ChipView({ chip }: { chip: Chip }) {
  return <span className={`pr-chip pr-chip-${chip.tone}`}>{chip.label}</span>
}

// ── Inbox: only what you alone can resolve ────────────────────────────────

type InboxItem = {
  key: string
  icon: string
  title: string
  body: ReactNode
  actions: { label: string; primary?: boolean; run: () => void }[]
}

// ── Shared bits ───────────────────────────────────────────────────────────

type AnimeInfo = {
  malId: number
  cover: string | null
  banner: string | null
  synopsis: string | null
  mean: number | null
  rank: number | null
  popularity: number | null
  mediaType: string | null
  episodes: number | null
  episodeMinutes: number | null
  season: string | null
  airedFrom: string | null
  airedTo: string | null
  source: string | null
  rating: string | null
  genres: string[]
  studios: string[]
  producers: string[]
}

// Real MAL details and AniList banners/producers, fetched once by title.
const ANIME = ANIME_JSON as Record<string, AnimeInfo>

const RowStyleContext = createContext<'thumb' | 'banner'>('thumb')

const MEDIA_TYPE: Record<string, string> = {
  tv: 'TV',
  movie: 'Movie',
  ova: 'OVA',
  ona: 'ONA',
  special: 'Special',
  tv_special: 'TV special',
}

const RATING: Record<string, string> = {
  g: 'G',
  pg: 'PG',
  pg_13: 'PG-13',
  r: 'R (17+)',
  'r+': 'R+',
  rx: 'Rx',
}

function titleCase(value: string): string {
  return value
    .split('_')
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(' ')
}

function AnimeFacts({
  title,
  personal = [],
}: {
  title: string
  personal?: [string, string | null][]
}) {
  const [synopsisOpen, setSynopsisOpen] = useState(false)
  const anime = ANIME[title]
  if (!anime) {
    return <p className="pr-hint">MyAnimeList has no match for this title.</p>
  }
  const aired = anime.airedFrom
    ? `${malDate(anime.airedFrom)}${
        anime.airedTo && anime.airedTo !== anime.airedFrom
          ? ` – ${malDate(anime.airedTo)}`
          : ''
      }`
    : null
  const facts: [string, string | null][] = [
    ...personal,
    ['Type', anime.mediaType ? (MEDIA_TYPE[anime.mediaType] ?? anime.mediaType) : null],
    [
      'Episodes',
      anime.episodes
        ? `${anime.episodes}${anime.episodeMinutes ? ` × ${anime.episodeMinutes} min` : ''}`
        : null,
    ],
    ['Season', anime.season],
    ['Aired', aired],
    ['Studios', anime.studios.join(', ') || null],
    ['Producers', anime.producers.join(', ') || null],
    ['Source', anime.source ? titleCase(anime.source) : null],
    ['Rating', anime.rating ? (RATING[anime.rating] ?? anime.rating) : null],
    ['Genres', anime.genres.join(', ') || null],
    [
      'MAL score',
      anime.mean
        ? `${anime.mean.toFixed(2)}${anime.rank ? ` · #${anime.rank} ranked` : ''}${
            anime.popularity ? ` · #${anime.popularity} popular` : ''
          }`
        : null,
    ],
  ]
  return (
    <>
      <dl className="pr-facts">
        {facts
          .filter((fact): fact is [string, string] => Boolean(fact[1]))
          .map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
      </dl>
      {anime.synopsis ? (
        <div>
          <p className={`pr-prose${synopsisOpen ? '' : ' pr-clamped'}`}>
            {anime.synopsis}
          </p>
          <button
            type="button"
            className="pr-link-btn"
            onClick={() => setSynopsisOpen(!synopsisOpen)}
          >
            {synopsisOpen ? 'Show less' : 'Read more'}
          </button>
        </div>
      ) : null}
      <div className="pr-btn-row">
        <a
          className="pr-btn pr-btn-sm"
          href={`https://myanimelist.net/anime/${anime.malId}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          MyAnimeList ↗
        </a>
        <a
          className="pr-btn pr-btn-sm"
          href={`https://anilist.co/search/anime?search=${encodeURIComponent(title)}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          AniList ↗
        </a>
      </div>
    </>
  )
}

const PROVIDER_LABEL: Record<Provider, string> = {
  crunchyroll: 'Crunchyroll',
  netflix: 'Netflix',
  disney: 'Disney+',
}

function Cover({
  title,
  hue,
  size = 'sm',
}: {
  title: string
  hue: number
  size?: 'sm' | 'lg'
}) {
  const url = ANIME[title]?.cover
  if (url) {
    return (
      <img
        className={`pr-cover pr-cover-${size} pr-cover-img`}
        src={url}
        alt=""
        loading="lazy"
        style={{ background: `hsl(${hue} 30% 22%)` }}
      />
    )
  }
  const initials = title
    .replace(/[^A-Za-z0-9 ]/g, '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
  return (
    <span
      className={`pr-cover pr-cover-${size}`}
      style={{
        background: `linear-gradient(160deg, hsl(${hue} 55% 42%), hsl(${(hue + 40) % 360} 45% 18%))`,
      }}
      aria-hidden="true"
    >
      {initials}
    </span>
  )
}

function Row({
  cover,
  title,
  titleEnglish,
  meta,
  trailing,
  onOpen,
  provider,
}: {
  cover: ReactNode
  title: string
  titleEnglish?: string
  meta?: ReactNode
  trailing?: ReactNode
  onOpen: () => void
  provider?: Provider
}) {
  const rowStyle = useContext(RowStyleContext)
  if (rowStyle === 'banner') {
    const anime = ANIME[title]
    const image = anime?.banner ?? anime?.cover
    return (
      <button
        type="button"
        className={`pr-row pr-row-banner${anime?.banner ? '' : ' pr-row-banner-fallback'}`}
        onClick={onOpen}
      >
        {image ? (
          <span
            className="pr-row-banner-img"
            style={{ backgroundImage: `url(${image})` }}
            aria-hidden="true"
          />
        ) : null}
        <span className="pr-row-banner-shade" aria-hidden="true" />
        {provider ? (
          <span className={`pr-provider-bar pr-provider-${provider}`} />
        ) : null}
        <span className="pr-row-text">
          <span className="pr-row-title">{title}</span>
          {titleEnglish ? (
            <span className="pr-row-sub">{titleEnglish}</span>
          ) : null}
          {meta ? <span className="pr-row-meta">{meta}</span> : null}
        </span>
        {trailing ? <span className="pr-row-trailing">{trailing}</span> : null}
      </button>
    )
  }
  return (
    <button type="button" className="pr-row" onClick={onOpen}>
      <span className="pr-row-cover">
        {cover}
        {provider ? (
          <span className={`pr-provider-dot pr-provider-${provider}`} />
        ) : null}
      </span>
      <span className="pr-row-text">
        <span className="pr-row-title">{title}</span>
        {titleEnglish ? (
          <span className="pr-row-sub">{titleEnglish}</span>
        ) : null}
        {meta ? <span className="pr-row-meta">{meta}</span> : null}
      </span>
      {trailing ? <span className="pr-row-trailing">{trailing}</span> : null}
    </button>
  )
}

function Group({
  title,
  count,
  defaultOpen,
  forceOpen,
  children,
}: {
  title: string
  count: number
  defaultOpen: boolean
  forceOpen: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  const shown = open || forceOpen
  return (
    <section className="pr-group">
      <button
        type="button"
        className="pr-group-header"
        aria-expanded={shown}
        onClick={() => setOpen(!open)}
      >
        <span>{title}</span>
        <span className="pr-group-count">{count}</span>
        <span className={`pr-chevron${shown ? ' open' : ''}`}>›</span>
      </button>
      {shown ? <div className="pr-list">{children}</div> : null}
    </section>
  )
}

function FilterBar({
  query,
  setQuery,
  sorts,
  sort,
  setSort,
  placeholder,
}: {
  query: string
  setQuery: (value: string) => void
  sorts: string[]
  sort: string
  setSort: (value: string) => void
  placeholder: string
}) {
  return (
    <div className="pr-filter">
      <input
        type="search"
        value={query}
        placeholder={placeholder}
        onChange={(event) => setQuery(event.target.value)}
      />
      <div className="pr-segmented">
        {sorts.map((option) => (
          <button
            key={option}
            type="button"
            className={sort === option ? 'active' : ''}
            onClick={() => setSort(option)}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Sheet ─────────────────────────────────────────────────────────────────

type SheetTarget =
  | { kind: 'watching'; id: string; focusSetup?: boolean }
  | { kind: 'new'; prefill?: PtwShow }
  | { kind: 'onHold'; id: string }
  | { kind: 'ptw'; id: string }
  | { kind: 'watched'; id: string }

type SetupDraft = {
  title: string
  provider: Provider
  url: string
  scheduleType: 'finite' | 'ongoing'
  startJst: string
  total: string
  malId: string
  redditTitle: string
  officialNewsUrl: string
}

function draftFrom(show: WatchingShow | null, prefill?: PtwShow): SetupDraft {
  return {
    title: show?.title ?? prefill?.title ?? '',
    provider: show?.provider ?? 'crunchyroll',
    url: show?.url ?? '',
    scheduleType: show?.scheduleType ?? 'finite',
    startJst: show?.startJst ?? (prefill?.start ? `${prefill.start}T00:00` : ''),
    total: String(show?.total ?? prefill?.episodes ?? ''),
    malId: show?.malId ? String(show.malId) : '',
    redditTitle: show?.redditTitle ?? '',
    officialNewsUrl: show?.officialNewsUrl ?? '',
  }
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="pr-field">
      <span className="pr-field-label">{label}</span>
      {children}
      {hint ? <span className="pr-hint">{hint}</span> : null}
    </label>
  )
}

function SetupForm({
  draft,
  setDraft,
}: {
  draft: SetupDraft
  setDraft: (draft: SetupDraft) => void
}) {
  const set = <K extends keyof SetupDraft>(key: K, value: SetupDraft[K]) =>
    setDraft({ ...draft, [key]: value })
  return (
    <div className="pr-form">
      <Field label="Title">
        <input value={draft.title} onChange={(e) => set('title', e.target.value)} />
      </Field>
      <div className="pr-field">
        <span className="pr-field-label">Provider</span>
        <div className="pr-segmented pr-segmented-full">
          {(['crunchyroll', 'netflix', 'disney'] as Provider[]).map((p) => (
            <button
              key={p}
              type="button"
              className={draft.provider === p ? 'active' : ''}
              onClick={() => set('provider', p)}
            >
              {PROVIDER_LABEL[p]}
            </button>
          ))}
        </div>
      </div>
      <Field label={`${PROVIDER_LABEL[draft.provider]} URL`}>
        <input value={draft.url} onChange={(e) => set('url', e.target.value)} />
      </Field>
      <div className="pr-field">
        <span className="pr-field-label">Schedule type</span>
        <div className="pr-segmented pr-segmented-full">
          {(['finite', 'ongoing'] as const).map((t) => (
            <button
              key={t}
              type="button"
              className={draft.scheduleType === t ? 'active' : ''}
              onClick={() => set('scheduleType', t)}
            >
              {t === 'finite' ? 'Finite season' : 'Ongoing'}
            </button>
          ))}
        </div>
      </div>
      <Field label="First drop (JST)" hint="Japan Time, as listed on the official site.">
        <input
          type="datetime-local"
          value={draft.startJst}
          onChange={(e) => set('startJst', e.target.value)}
        />
      </Field>
      {draft.scheduleType === 'finite' ? (
        <Field label="Episodes in season">
          <input inputMode="numeric" value={draft.total} onChange={(e) => set('total', e.target.value)} />
        </Field>
      ) : null}
      <Field label="MAL anime ID">
        <input inputMode="numeric" value={draft.malId} onChange={(e) => set('malId', e.target.value)} />
      </Field>
      <Field label="Official news URL" hint="Where the checker reads break announcements.">
        <input
          value={draft.officialNewsUrl}
          placeholder="https://…/news/"
          onChange={(e) => set('officialNewsUrl', e.target.value)}
        />
      </Field>
      <Field label="Reddit search title" hint="Only when r/anime thread slugs don't match the title.">
        <input value={draft.redditTitle} onChange={(e) => set('redditTitle', e.target.value)} />
      </Field>
    </div>
  )
}

function SheetSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="pr-sheet-section">
      <h3>{title}</h3>
      {children}
    </section>
  )
}

// ── App ───────────────────────────────────────────────────────────────────

type Tab = 'watching' | 'onHold' | 'ptw' | 'watched'

const TABS: { key: Tab; label: string; short: string; icon: string }[] = [
  { key: 'watching', label: 'Watching', short: 'Watching', icon: '▶' },
  { key: 'onHold', label: 'On hold', short: 'On hold', icon: '❚❚' },
  { key: 'ptw', label: 'Plan to watch', short: 'PTW', icon: '☰' },
  { key: 'watched', label: 'Watched', short: 'Watched', icon: '✓' },
]

function Prototype({ scenario }: { scenario: Scenario }) {
  const [data, setData] = useState<Fixture>(() => buildFixture(scenario, NOW))
  const [tab, setTab] = useState<Tab>('watching')
  const [sheet, setSheet] = useState<SheetTarget | null>(null)
  const [draft, setDraft] = useState<SetupDraft | null>(null)
  const [savedDraft, setSavedDraft] = useState<SetupDraft | null>(null)
  const [setupOpen, setSetupOpen] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [ptwQuery, setPtwQuery] = useState('')
  const [ptwSort, setPtwSort] = useState('Start date')
  const [watchedQuery, setWatchedQuery] = useState('')
  const [watchedSort, setWatchedSort] = useState('Recent')

  const menuRef = useRef<HTMLDivElement>(null)

  // Esc closes the topmost layer: discard prompt, search, menu, then sheet.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      if (confirmDiscard) setConfirmDiscard(false)
      else if (searchOpen) setSearchOpen(false)
      else if (menuOpen) setMenuOpen(false)
      else if (sheet) requestClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  })

  useEffect(() => {
    if (!menuOpen) return
    function onPointerDown(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [menuOpen])

  function flash(message: string) {
    setToast(message)
    window.setTimeout(() => setToast((current) => (current === message ? null : current)), 2600)
  }

  function updateShow(id: string, change: (show: WatchingShow) => WatchingShow) {
    setData((d) => ({ ...d, watching: d.watching.map((s) => (s.id === id ? change(s) : s)) }))
  }

  function open(target: SheetTarget) {
    setSheet(target)
    setConfirmDiscard(false)
    if (target.kind === 'watching') {
      const show = data.watching.find((s) => s.id === target.id) ?? null
      const initial = draftFrom(show)
      setDraft(initial)
      setSavedDraft(initial)
      setSetupOpen(Boolean(target.focusSetup))
    } else if (target.kind === 'new') {
      const initial = draftFrom(null, target.prefill)
      setDraft(initial)
      setSavedDraft(draftFrom(null))
      setSetupOpen(true)
    } else {
      setDraft(null)
      setSavedDraft(null)
    }
  }

  const dirty =
    draft !== null && savedDraft !== null && JSON.stringify(draft) !== JSON.stringify(savedDraft)

  function requestClose() {
    if (dirty && sheet && (sheet.kind === 'watching' || sheet.kind === 'new')) {
      setConfirmDiscard(true)
      return
    }
    setSheet(null)
  }

  const inbox: InboxItem[] = useMemo(() => {
    const items: InboxItem[] = []
    for (const show of data.watching) {
      if (show.announced) {
        const a = show.announced
        items.push({
          key: `announced-${show.id}`,
          icon: '⚠',
          title: show.titleEnglish || show.title,
          body: (
            <>
              Ep {a.episode} postponed
              {a.newDateAt ? `, new date ${monthDay(a.newDateAt)}` : ', new date TBA'}
              {' · '}
              <a href={a.sourceUrl} target="_blank" rel="noopener noreferrer">
                Source
              </a>
            </>
          ),
          actions: [
            ...(a.suggestionWeeks
              ? [
                  {
                    label: `Add ${a.suggestionWeeks}w break`,
                    primary: true,
                    run: () => {
                      updateShow(show.id, (s) => ({
                        ...s,
                        announced: null,
                        nextDropAt: s.nextDropAt + a.suggestionWeeks! * WEEK,
                        breaks: [...s.breaks, { afterEpisode: a.episode - 1, weeks: a.suggestionWeeks! }],
                      }))
                      flash(`${a.suggestionWeeks}-week break added. Later drops moved.`)
                    },
                  },
                ]
              : []),
            {
              label: 'Dismiss',
              run: () => {
                updateShow(show.id, (s) => ({ ...s, announced: null }))
                flash('Announced break dismissed.')
              },
            },
          ],
        })
      }
      if (!show.officialNewsUrl) {
        items.push({
          key: `news-${show.id}`,
          icon: '📰',
          title: show.titleEnglish || show.title,
          body: 'No official news source. Breaks are only read from Anime News Network.',
          actions: [{ label: 'Set URL →', run: () => open({ kind: 'watching', id: show.id, focusSetup: true }) }],
        })
      }
      if (!show.malId) {
        items.push({
          key: `mal-${show.id}`,
          icon: '🔗',
          title: show.titleEnglish || show.title,
          body: 'Not linked to MyAnimeList, so episode progress can’t sync.',
          actions: [{ label: 'Link MAL →', run: () => open({ kind: 'watching', id: show.id, focusSetup: true }) }],
        })
      }
    }
    for (const show of data.ptw.filter((p) => p.startedAiring)) {
      items.push({
        key: `airing-${show.id}`,
        icon: '📺',
        title: show.titleEnglish || show.title,
        body: `From Plan to watch, started airing ${malDate(show.start)}.`,
        actions: [
          { label: 'Move to Watching', primary: true, run: () => open({ kind: 'new', prefill: show }) },
          {
            label: 'Not now',
            run: () =>
              setData((d) => ({
                ...d,
                ptw: d.ptw.map((p) => (p.id === show.id ? { ...p, startedAiring: false } : p)),
              })),
          },
        ],
      })
    }
    return items
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  const counts: Record<Tab, number> = {
    watching: data.watching.length,
    onHold: data.onHold.length,
    ptw: data.ptw.length,
    watched: data.watched.length,
  }

  // ── Pages ──

  function WatchingPage() {
    return (
      <>
        <div className="pr-heading">
          <h1>Watching</h1>
          <button type="button" className="pr-btn pr-btn-icon" aria-label="Add show" onClick={() => open({ kind: 'new' })}>
            +
          </button>
        </div>
        {inbox.length > 0 ? (
          <section className="pr-inbox">
            <h2 className="pr-eyebrow">
              Needs you <span className="pr-eyebrow-count">{inbox.length}</span>
            </h2>
            <div className="pr-inbox-cards">
              {inbox.map((item) => (
                <div key={item.key} className="pr-inbox-card">
                  <span className="pr-inbox-icon" aria-hidden="true">{item.icon}</span>
                  <div className="pr-inbox-text">
                    <strong>{item.title}</strong>
                    <span>{item.body}</span>
                  </div>
                  <div className="pr-inbox-actions">
                    {item.actions.map((action) => (
                      <button
                        key={action.label}
                        type="button"
                        className={`pr-btn pr-btn-sm${action.primary ? ' pr-btn-primary' : ''}`}
                        onClick={action.run}
                      >
                        {action.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}
        <div className="pr-list">
          {data.watching.map((show) => {
            const chip = scheduleChip(show)
            const behind = show.watched < show.latestDropped
            const nextEp = show.latestDropped + 1
            return (
              <Row
                key={show.id}
                cover={<Cover title={show.title} hue={show.hue} />}
                provider={show.provider}
                title={show.title}
                titleEnglish={show.titleEnglish}
                meta={
                  <>
                    {chip ? <ChipView chip={chip} /> : null}
                    <span>
                      Ep {nextEp} {show.stillWaiting || show.providerLag ? 'expected' : ''} {when(show.nextDropAt)}
                    </span>
                  </>
                }
                trailing={
                  <span
                    className={`pr-ep${behind ? ' pr-ep-behind' : ''}`}
                    title={behind ? `${show.latestDropped - show.watched} unwatched` : undefined}
                  >
                    Ep {show.watched}/{show.total ?? '?'}
                  </span>
                }
                onOpen={() => open({ kind: 'watching', id: show.id })}
              />
            )
          })}
        </div>
      </>
    )
  }

  function OnHoldPage() {
    return (
      <>
        <div className="pr-heading">
          <h1>On hold</h1>
        </div>
        <p className="pr-subtitle">Not checked, no alerts, until restored to Watching.</p>
        <div className="pr-list">
          {data.onHold.map((show) => (
            <Row
              key={show.id}
              cover={<Cover title={show.title} hue={show.hue} />}
              provider={show.provider}
              title={show.title}
              titleEnglish={show.titleEnglish}
              meta={<span>On hold since {monthDay(show.since)} · ep {show.watched}</span>}
              onOpen={() => open({ kind: 'onHold', id: show.id })}
            />
          ))}
        </div>
      </>
    )
  }

  function PtwPage() {
    const q = ptwQuery.trim().toLowerCase()
    const matches = data.ptw.filter(
      (p) => !q || `${p.title} ${p.titleEnglish}`.toLowerCase().includes(q)
    )
    const sorted = [...matches].sort((a, b) =>
      ptwSort === 'Title'
        ? a.title.localeCompare(b.title)
        : ptwSort === 'Score'
          ? (b.mean ?? 0) - (a.mean ?? 0)
          : (a.start ?? '9999').localeCompare(b.start ?? '9999')
    )
    const groups: [string, PtwShow[]][] = [
      ['Not yet aired', sorted.filter((p) => !p.aired)],
      ['Aired', sorted.filter((p) => p.aired)],
    ]
    return (
      <>
        <div className="pr-heading">
          <h1>Plan to watch</h1>
          <span className="pr-updated">updated 3h ago</span>
        </div>
        <FilterBar
          query={ptwQuery}
          setQuery={setPtwQuery}
          sorts={['Start date', 'Score', 'Title']}
          sort={ptwSort}
          setSort={setPtwSort}
          placeholder="Filter plan to watch"
        />
        {groups.map(([title, shows], index) =>
          shows.length ? (
            <Group key={title} title={title} count={shows.length} defaultOpen={index === 0} forceOpen={Boolean(q)}>
              {shows.map((show) => (
                <Row
                  key={show.id}
                  cover={<Cover title={show.title} hue={show.hue} />}
                  title={show.title}
                  titleEnglish={show.titleEnglish}
                  meta={
                    <span>
                      {show.aired
                        ? `${show.start?.slice(0, 4)} · ${ANIME[show.title]?.episodes ?? show.episodes} ep`
                        : `Starts ${malDate(show.start)}`}
                    </span>
                  }
                  trailing={
                    show.startedAiring ? (
                      <ChipView chip={{ label: 'Airing', tone: 'blue' }} />
                    ) : show.mean ? (
                      <span className="pr-score">{show.mean.toFixed(1)}</span>
                    ) : null
                  }
                  onOpen={() => open({ kind: 'ptw', id: show.id })}
                />
              ))}
            </Group>
          ) : null
        )}
      </>
    )
  }

  function WatchedPage() {
    const q = watchedQuery.trim().toLowerCase()
    const matches = data.watched.filter(
      (w) => !q || `${w.title} ${w.titleEnglish}`.toLowerCase().includes(q)
    )
    let groups: [string, WatchedShow[]][]
    if (watchedSort === 'Score') {
      const scores = [...new Set(matches.map((w) => w.score))].sort((a, b) => b - a)
      groups = scores.map((s) => [`★ ${s}`, matches.filter((w) => w.score === s)])
    } else if (watchedSort === 'Title') {
      groups = [['A–Z', [...matches].sort((a, b) => a.title.localeCompare(b.title))]]
    } else {
      const sorted = [...matches].sort((a, b) => b.finishedAt - a.finishedAt)
      const years = [...new Set(sorted.map((w) => new Date(w.finishedAt).getUTCFullYear()))]
      groups = years.map((y) => [String(y), sorted.filter((w) => new Date(w.finishedAt).getUTCFullYear() === y)])
    }
    return (
      <>
        <div className="pr-heading">
          <h1>Watched</h1>
          <span className="pr-updated">updated 1d ago</span>
        </div>
        <FilterBar
          query={watchedQuery}
          setQuery={setWatchedQuery}
          sorts={['Recent', 'Score', 'Title']}
          sort={watchedSort}
          setSort={setWatchedSort}
          placeholder="Filter by title, studio, or genre"
        />
        {groups.map(([title, shows], index) => (
          <Group key={`${watchedSort}-${title}`} title={title} count={shows.length} defaultOpen={index === 0} forceOpen={Boolean(q)}>
            {shows.map((show) => (
              <Row
                key={show.id}
                cover={<Cover title={show.title} hue={show.hue} />}
                title={show.title}
                titleEnglish={show.titleEnglish}
                meta={<span>Finished {monthDay(show.finishedAt)} · {ANIME[show.title]?.episodes ?? show.episodes} ep</span>}
                trailing={<span className="pr-score">★ {show.score}</span>}
                onOpen={() => open({ kind: 'watched', id: show.id })}
              />
            ))}
          </Group>
        ))}
      </>
    )
  }

  // ── Sheet body ──

  function SheetBody() {
    if (!sheet) return null

    if (sheet.kind === 'watching' || sheet.kind === 'new') {
      const show = sheet.kind === 'watching' ? data.watching.find((s) => s.id === sheet.id) ?? null : null
      const isNew = !show
      const behind = show ? show.watched < show.latestDropped : false
      return (
        <>
          <div className="pr-sheet-hero">
            <Cover title={show?.title ?? (draft?.title || 'New')} hue={show?.hue ?? 200} size="lg" />
            <div>
              <h2>{show ? show.title : draft?.title || 'New show'}</h2>
              {show ? <p className="pr-row-sub">{show.titleEnglish}</p> : null}
              {show ? (
                <p className="pr-hero-meta">
                  <span className={`pr-provider-dot pr-provider-${show.provider} pr-dot-inline`} />
                  {PROVIDER_LABEL[show.provider]}
                  {(() => {
                    const chip = scheduleChip(show)
                    return chip ? <ChipView chip={chip} /> : null
                  })()}
                </p>
              ) : (
                <p className="pr-hint">Nothing is added until you press Add show.</p>
              )}
            </div>
          </div>

          {show ? (
            <SheetSection title="Watch">
              <div className="pr-btn-row">
                <a className="pr-btn pr-btn-primary" href={show.url} target="_blank" rel="noopener noreferrer">
                  Watch ep {Math.min(show.watched + 1, show.latestDropped)}
                </a>
                <a className="pr-btn" href="#discussion">Discussion</a>
                <a className="pr-btn" href="#mal">MAL</a>
              </div>
              <div className="pr-stepper-row">
                <span className="pr-field-label">Current episode</span>
                <div className="pr-stepper">
                  <button
                    type="button"
                    disabled={data.malDown || show.watched <= 0}
                    onClick={() => {
                      updateShow(show.id, (s) => ({ ...s, watched: s.watched - 1 }))
                      flash('Saved to MyAnimeList.')
                    }}
                  >
                    −
                  </button>
                  <span className={behind ? 'pr-ep-behind' : ''}>{show.watched}</span>
                  <button
                    type="button"
                    disabled={data.malDown || show.watched >= (show.total ?? Infinity)}
                    onClick={() => {
                      updateShow(show.id, (s) => ({ ...s, watched: s.watched + 1 }))
                      flash('Saved to MyAnimeList.')
                    }}
                  >
                    +
                  </button>
                </div>
              </div>
              {data.malDown ? <p className="pr-hint">MyAnimeList is down; progress is read-only until it’s back.</p> : null}
            </SheetSection>
          ) : null}

          {show ? (
            <SheetSection title="Schedule">
              {show.announced ? (
                <div className="pr-callout">
                  <strong>⚠ Announced break</strong>
                  <span>
                    Ep {show.announced.episode} postponed
                    {show.announced.newDateAt ? ` to ${monthDay(show.announced.newDateAt)}` : ', new date TBA'}.
                  </span>
                  <div className="pr-btn-row">
                    {inbox
                      .find((i) => i.key === `announced-${show.id}`)
                      ?.actions.map((action) => (
                        <button
                          key={action.label}
                          type="button"
                          className={`pr-btn pr-btn-sm${action.primary ? ' pr-btn-primary' : ''}`}
                          onClick={action.run}
                        >
                          {action.label}
                        </button>
                      ))}
                  </div>
                </div>
              ) : null}
              <ol className="pr-drops">
                {[0, 1, 2].map((i) => {
                  const ep = show.latestDropped + 1 + i
                  if (show.total && ep > show.total) return null
                  return (
                    <li key={ep}>
                      <span>Ep {ep}</span>
                      <span>{when(show.nextDropAt + i * WEEK)}</span>
                    </li>
                  )
                })}
              </ol>
              {show.breaks.length ? (
                <ul className="pr-breaks">
                  {show.breaks.map((b, index) => (
                    <li key={`${b.afterEpisode}-${index}`}>
                      <span>
                        {b.weeks}-week break after ep {b.afterEpisode}
                      </span>
                      <button
                        type="button"
                        className="pr-link-btn"
                        onClick={() => {
                          updateShow(show.id, (s) => ({
                            ...s,
                            breaks: s.breaks.filter((_, j) => j !== index),
                            nextDropAt: s.nextDropAt - b.weeks * WEEK,
                          }))
                          flash('Break removed. Later drops moved back.')
                        }}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              <button
                type="button"
                className="pr-btn pr-btn-sm"
                onClick={() => {
                  updateShow(show.id, (s) => ({
                    ...s,
                    breaks: [...s.breaks, { afterEpisode: s.latestDropped, weeks: 1 }],
                    nextDropAt: s.nextDropAt + WEEK,
                  }))
                  flash('1-week break added. Later drops moved.')
                }}
              >
                Add 1-week break
              </button>
            </SheetSection>
          ) : null}

          <section className="pr-sheet-section">
            <button
              type="button"
              className="pr-section-toggle"
              aria-expanded={setupOpen}
              onClick={() => setSetupOpen(!setupOpen)}
            >
              <h3>Setup</h3>
              {dirty ? <span className="pr-dirty">Unsaved</span> : null}
              <span className={`pr-chevron${setupOpen ? ' open' : ''}`}>›</span>
            </button>
            {setupOpen && draft ? (
              <>
                <SetupForm draft={draft} setDraft={setDraft} />
                <div className="pr-btn-row pr-save-row">
                  <button
                    type="button"
                    className="pr-btn pr-btn-primary"
                    disabled={!dirty || !draft.title.trim()}
                    onClick={() => {
                      if (isNew) {
                        const id = `new-${Date.now()}`
                        setData((d) => ({
                          ...d,
                          watching: [
                            ...d.watching,
                            {
                              id,
                              title: draft.title,
                              titleEnglish: '',
                              provider: draft.provider,
                              hue: 180,
                              watched: 0,
                              latestDropped: 0,
                              total: Number(draft.total) || null,
                              nextDropAt: NOW + 5 * DAY,
                              announced: null,
                              providerLag: false,
                              stillWaiting: false,
                              breaks: [],
                              officialNewsUrl: draft.officialNewsUrl || null,
                              malId: Number(draft.malId) || null,
                              redditTitle: draft.redditTitle,
                              scheduleType: draft.scheduleType,
                              startJst: draft.startJst,
                              url: draft.url,
                            },
                          ],
                          ptw:
                            sheet.kind === 'new' && sheet.prefill
                              ? d.ptw.filter((p) => p.id !== sheet.prefill!.id)
                              : d.ptw,
                        }))
                        setSheet(null)
                        setTab('watching')
                        flash(`${draft.title} added to Watching.`)
                      } else {
                        updateShow(show.id, (s) => ({
                          ...s,
                          title: draft.title,
                          provider: draft.provider,
                          url: draft.url,
                          scheduleType: draft.scheduleType,
                          startJst: draft.startJst,
                          total: Number(draft.total) || null,
                          malId: Number(draft.malId) || null,
                          redditTitle: draft.redditTitle,
                          officialNewsUrl: draft.officialNewsUrl || null,
                        }))
                        setSavedDraft(draft)
                        flash('Saved. (One commit for this show.)')
                      }
                    }}
                  >
                    {isNew ? 'Add show' : 'Save'}
                  </button>
                  {dirty && !isNew ? (
                    <button type="button" className="pr-btn" onClick={() => setDraft(savedDraft)}>
                      Revert
                    </button>
                  ) : null}
                </div>
              </>
            ) : null}
          </section>

          {show ? (
            <SheetSection title="Manage">
              <div className="pr-btn-row">
                <button
                  type="button"
                  className="pr-btn"
                  onClick={() => {
                    setData((d) => ({
                      ...d,
                      watching: d.watching.filter((s) => s.id !== show.id),
                      onHold: [
                        ...d.onHold,
                        {
                          id: show.id,
                          title: show.title,
                          titleEnglish: show.titleEnglish,
                          provider: show.provider,
                          hue: show.hue,
                          since: NOW,
                          watched: show.watched,
                        },
                      ],
                    }))
                    setSheet(null)
                    flash(`${show.title} put on hold.`)
                  }}
                >
                  Put on hold
                </button>
                <button
                  type="button"
                  className="pr-btn"
                  onClick={() => {
                    setData((d) => ({ ...d, watching: d.watching.filter((s) => s.id !== show.id) }))
                    setSheet(null)
                    flash(`${show.title} marked completed.`)
                  }}
                >
                  Mark completed
                </button>
                <button
                  type="button"
                  className="pr-btn pr-btn-danger"
                  onClick={() => {
                    if (window.confirm(`Remove ${show.title}? Alerts stop for it.`)) {
                      setData((d) => ({ ...d, watching: d.watching.filter((s) => s.id !== show.id) }))
                      setSheet(null)
                    }
                  }}
                >
                  Remove
                </button>
              </div>
            </SheetSection>
          ) : null}
        </>
      )
    }

    if (sheet.kind === 'onHold') {
      const show = data.onHold.find((s) => s.id === sheet.id) as OnHoldShow
      return (
        <>
          <div className="pr-sheet-hero">
            <Cover title={show.title} hue={show.hue} size="lg" />
            <div>
              <h2>{show.title}</h2>
              <p className="pr-hero-meta">On hold since {monthDay(show.since)} · ep {show.watched}</p>
            </div>
          </div>
          <SheetSection title="Manage">
            <p className="pr-hint">Restoring resumes episode checks and Discord alerts.</p>
            <button
              type="button"
              className="pr-btn pr-btn-primary"
              onClick={() => {
                setData((d) => ({ ...d, onHold: d.onHold.filter((s) => s.id !== show.id) }))
                setSheet(null)
                flash(`${show.title} moved back to Watching.`)
              }}
            >
              Move back to Watching
            </button>
          </SheetSection>
        </>
      )
    }

    if (sheet.kind === 'ptw') {
      const show = data.ptw.find((s) => s.id === sheet.id) as PtwShow
      return (
        <>
          <div className="pr-sheet-hero">
            <Cover title={show.title} hue={show.hue} size="lg" />
            <div>
              <h2>{show.title}</h2>
              {show.titleEnglish ? <p className="pr-row-sub">{show.titleEnglish}</p> : null}
              <p className="pr-hero-meta">
                {show.aired ? `Aired ${malDate(show.start)} · ${ANIME[show.title]?.episodes ?? show.episodes} ep` : `Starts ${malDate(show.start)}`}
                {show.mean ? ` · MAL ${show.mean.toFixed(1)}` : ''}
              </p>
            </div>
          </div>
          <SheetSection title="Manage">
            <div className="pr-btn-row">
              <button type="button" className="pr-btn pr-btn-primary" onClick={() => open({ kind: 'new', prefill: show })}>
                Move to Watching
              </button>
            </div>
          </SheetSection>
          <SheetSection title="About">
            <AnimeFacts title={show.title} />
          </SheetSection>
        </>
      )
    }

    const show = data.watched.find((s) => s.id === sheet.id) as WatchedShow
    return (
      <>
        <div className="pr-sheet-hero">
          <Cover title={show.title} hue={show.hue} size="lg" />
          <div>
            <h2>{show.title}</h2>
            {show.titleEnglish ? <p className="pr-row-sub">{show.titleEnglish}</p> : null}
            <p className="pr-hero-meta">
              Finished {monthDay(show.finishedAt)} · {ANIME[show.title]?.episodes ?? show.episodes} ep
            </p>
          </div>
        </div>
        <SheetSection title="Your list">
          <div className="pr-score-big">★ {show.score}</div>
          <AnimeFacts
            title={show.title}
            personal={[
              ['Started', monthDay(show.finishedAt - Math.max(1, show.episodes * 2) * DAY)],
              ['Finished', monthDay(show.finishedAt)],
              ['Rewatched', '0 times'],
            ]}
          />
        </SheetSection>
      </>
    )
  }

  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return []
    const hit = (t: string, e: string) => `${t} ${e}`.toLowerCase().includes(q)
    return [
      ...data.watching.filter((s) => hit(s.title, s.titleEnglish)).map((s) => ({ s, tab: 'watching' as Tab, target: { kind: 'watching', id: s.id } as SheetTarget })),
      ...data.onHold.filter((s) => hit(s.title, s.titleEnglish)).map((s) => ({ s, tab: 'onHold' as Tab, target: { kind: 'onHold', id: s.id } as SheetTarget })),
      ...data.ptw.filter((s) => hit(s.title, s.titleEnglish)).map((s) => ({ s, tab: 'ptw' as Tab, target: { kind: 'ptw', id: s.id } as SheetTarget })),
      ...data.watched.filter((s) => hit(s.title, s.titleEnglish)).map((s) => ({ s, tab: 'watched' as Tab, target: { kind: 'watched', id: s.id } as SheetTarget })),
    ].slice(0, 12)
  }, [search, data])

  return (
    <div className="pr-root">
      <header className="pr-header">
        <div className="pr-header-inner">
          <span className="pr-brand">Episode Checker</span>
          <nav className="pr-tabs-top" aria-label="Lists">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                className={tab === t.key ? 'active' : ''}
                onClick={() => setTab(t.key)}
              >
                {t.label}
                <TabBadge tab={t.key} counts={counts} inbox={inbox.length} />
              </button>
            ))}
          </nav>
          <div className="pr-header-actions">
            <button type="button" className="pr-icon-btn" aria-label="Search" onClick={() => setSearchOpen(true)}>
              <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" />
                <path d="M10.4 10.4L13.75 13.75" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
            <div className="pr-menu-wrap" ref={menuRef}>
              <button type="button" className="pr-avatar" aria-label="Account menu" onClick={() => setMenuOpen(!menuOpen)}>
                <img src="/icons/icon-192.png" alt="" />
              </button>
              {menuOpen ? (
                <div className="pr-menu" role="menu">
                  <button type="button" onClick={() => { setMenuOpen(false); flash('Would open MAL setup.') }}>
                    MAL setup
                  </button>
                  <button type="button" className="pr-danger" onClick={() => { setMenuOpen(false); flash('Would log out.') }}>
                    Log out
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      {data.malDown ? (
        <div className="pr-banner" role="status">
          <strong>MyAnimeList is down.</strong> Progress is read-only until it’s back.
        </div>
      ) : null}

      <main className="pr-main">
        {tab === 'watching' ? WatchingPage() : null}
        {tab === 'onHold' ? OnHoldPage() : null}
        {tab === 'ptw' ? PtwPage() : null}
        {tab === 'watched' ? WatchedPage() : null}
      </main>

      <nav className="pr-tabbar" aria-label="Lists">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={tab === t.key ? 'active' : ''}
            onClick={() => setTab(t.key)}
          >
            <span className="pr-tab-icon" aria-hidden="true">
              {t.icon}
              <TabBadge tab={t.key} counts={counts} inbox={inbox.length} floating />
            </span>
            <span className="pr-tab-label pr-tab-label-long">{t.label}</span>
            <span className="pr-tab-label pr-tab-label-short">{t.short}</span>
          </button>
        ))}
      </nav>

      {sheet ? (
        <div className="pr-sheet-layer">
          <div className="pr-backdrop" onClick={requestClose} />
          <aside className="pr-sheet" role="dialog" aria-modal="true">
            <div className="pr-sheet-grab" />
            <button type="button" className="pr-sheet-close" aria-label="Close" onClick={requestClose}>
              ✕
            </button>
            <div className="pr-sheet-scroll">{SheetBody()}</div>
            {confirmDiscard ? (
              <div className="pr-confirm" role="alertdialog">
                <p>
                  <strong>Discard changes?</strong>
                  <br />
                  Your Setup edits haven’t been saved.
                </p>
                <div className="pr-btn-row">
                  <button type="button" className="pr-btn" onClick={() => setConfirmDiscard(false)}>
                    Keep editing
                  </button>
                  <button
                    type="button"
                    className="pr-btn pr-btn-danger-solid"
                    onClick={() => {
                      setConfirmDiscard(false)
                      setSheet(null)
                    }}
                  >
                    Discard
                  </button>
                </div>
              </div>
            ) : null}
          </aside>
        </div>
      ) : null}

      {searchOpen ? (
        <div className="pr-search-layer" onClick={() => setSearchOpen(false)}>
          <div className="pr-search" onClick={(e) => e.stopPropagation()}>
            <input
              autoFocus
              value={search}
              placeholder="Search all lists"
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && setSearchOpen(false)}
            />
            <div className="pr-search-results">
              {searchResults.map(({ s, tab: resultTab, target }) => (
                <button
                  key={`${resultTab}-${s.id}`}
                  type="button"
                  onClick={() => {
                    setTab(resultTab)
                    setSearchOpen(false)
                    setSearch('')
                    open(target)
                  }}
                >
                  <span>{s.title}</span>
                  <span className="pr-search-tab">{TABS.find((t) => t.key === resultTab)?.label}</span>
                </button>
              ))}
              {search && searchResults.length === 0 ? <p className="pr-hint">No matches.</p> : null}
            </div>
          </div>
        </div>
      ) : null}

      {toast ? <div className="pr-toast">{toast}</div> : null}
    </div>
  )
}

function TabBadge({
  tab,
  counts,
  inbox,
  floating,
}: {
  tab: Tab
  counts: Record<Tab, number>
  inbox: number
  floating?: boolean
}) {
  const needsYou = tab === 'watching' && inbox > 0
  const value = needsYou ? inbox : counts[tab]
  return (
    <span className={`pr-badge${needsYou ? ' pr-badge-alert' : ''}${floating ? ' pr-badge-floating' : ''}`}>
      {value}
    </span>
  )
}

function PrototypeWithVariant() {
  const params = useSearchParams()
  const raw = params.get('variant')
  const scenario: Scenario = raw === 'B' || raw === 'C' ? raw : 'A'
  const rowStyle = params.get('rows') === 'banner' ? 'banner' : 'thumb'
  const router = useRouter()
  const pathname = usePathname()
  // Fake times are relative to page load, so render client-only to avoid a
  // hydration mismatch.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) return null
  return (
    <>
      <RowStyleContext.Provider value={rowStyle}>
        <Prototype key={scenario} scenario={scenario} />
      </RowStyleContext.Provider>
      <PrototypeSwitcher variants={SCENARIOS} current={scenario}>
        <button
          type="button"
          className="prototype-switcher-toggle"
          onClick={() => {
            const next = new URLSearchParams(params.toString())
            next.set('rows', rowStyle === 'banner' ? 'thumb' : 'banner')
            router.replace(`${pathname}?${next}`)
          }}
        >
          Rows: {rowStyle === 'banner' ? 'Banner' : 'Thumb'}
        </button>
      </PrototypeSwitcher>
    </>
  )
}

export default function RedesignPrototypePage() {
  return (
    <Suspense fallback={null}>
      <PrototypeWithVariant />
    </Suspense>
  )
}
