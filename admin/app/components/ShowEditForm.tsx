'use client'

import { SegmentedControl } from '@/app/components/SegmentedControl'
import type { ShowFormValues } from '@/lib/types'
import type { ShowProvider } from '@shared/types'
import { describeBreak } from '@/lib/schedule-break'
import { MAL_DOWN_MESSAGE } from '@/lib/watching'

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

// The "More options" fields of a Watching row. `rowKey` keeps input IDs
// unique per row.
export function ShowEditForm({
  rowKey,
  show,
  startHint,
  malLinked,
  malBlocked,
  malEditOpen,
  completingShow,
  holding,
  onToggleMalEdit,
  onUpdate,
  onUpdateSchedule,
  onAddBreak,
  onRemoveBreak,
  onComplete,
  onHold,
  onRemove,
}: {
  rowKey: string
  show: ShowFormValues
  startHint: string | null
  malLinked: boolean
  malBlocked: boolean
  malEditOpen: boolean
  completingShow: boolean
  holding: boolean
  onToggleMalEdit: () => void
  onUpdate: <K extends keyof ShowFormValues>(
    field: K,
    value: ShowFormValues[K]
  ) => void
  onUpdateSchedule: (
    field: keyof ShowFormValues['schedule'],
    value: string
  ) => void
  onAddBreak: () => void
  onRemoveBreak: (index: number) => void
  onComplete: () => void
  onHold: () => void
  onRemove: () => void
}) {
  const id = (name: string) => `${name}-${rowKey}`

  return (
    <details className="disclosure" open={!show.id}>
      <summary>More options</summary>
      <div className="disclosure-body">
        <div className="field">
          <label htmlFor={id('title')}>Title</label>
          <input
            id={id('title')}
            value={show.title}
            onChange={(event) => onUpdate('title', event.target.value)}
            placeholder="One Piece"
          />
        </div>

        <div className="field">
          <span id={id('provider-label')}>Provider</span>
          <SegmentedControl
            ariaLabel="Provider"
            value={show.provider}
            options={[
              { value: 'crunchyroll', label: 'Crunchyroll' },
              { value: 'netflix', label: 'Netflix' },
              { value: 'disney', label: 'Disney+' },
            ]}
            onChange={(value) => onUpdate('provider', value as ShowProvider)}
          />
        </div>

        {show.provider === 'crunchyroll' ? (
          <div className="field">
            <label htmlFor={id('url')}>Crunchyroll series URL</label>
            <input
              id={id('url')}
              value={show.crunchyrollUrl}
              onChange={(event) =>
                onUpdate('crunchyrollUrl', event.target.value)
              }
              placeholder="https://www.crunchyroll.com/series/..."
              required
            />
          </div>
        ) : show.provider === 'netflix' ? (
          <div className="field">
            <label htmlFor={id('netflix-url')}>Netflix title URL</label>
            <input
              id={id('netflix-url')}
              value={show.netflixUrl}
              onChange={(event) => onUpdate('netflixUrl', event.target.value)}
              placeholder="https://www.netflix.com/title/..."
              required
            />
          </div>
        ) : (
          <div className="field">
            <label htmlFor={id('disney-url')}>Disney+ title URL</label>
            <input
              id={id('disney-url')}
              value={show.disneyUrl}
              onChange={(event) => onUpdate('disneyUrl', event.target.value)}
              placeholder="https://www.disneyplus.com/browse/entity-..."
              required
            />
          </div>
        )}

        <div className="field">
          <span id={id('mode-label')}>Schedule type</span>
          <SegmentedControl
            ariaLabel="Schedule type"
            value={show.schedule.mode}
            options={[
              { value: 'finite', label: 'Finite season' },
              { value: 'ongoing', label: 'Ongoing' },
            ]}
            onChange={(value) => onUpdateSchedule('mode', value)}
          />
        </div>

        <div className="field">
          <label htmlFor={id('start')}>
            Start date and time (Japan Time / JST)
          </label>
          <input
            id={id('start')}
            type="datetime-local"
            value={show.schedule.startAt}
            onChange={(event) =>
              onUpdateSchedule('startAt', event.target.value)
            }
            required
          />
          {startHint ? (
            <p className="hint schedule-start-hint">{startHint}</p>
          ) : null}
          {show.id ? (
            <div className="break-actions">
              <button
                className="btn btn-secondary"
                type="button"
                onClick={onAddBreak}
              >
                Add break
              </button>
              <p className="hint">
                Adds a 1-week break after the last dropped episode: later drops
                shift by 7 days, earlier ones stay, and Discord and Google
                Calendar events rebuild.
              </p>
            </div>
          ) : null}
          {show.schedule.breaks?.length ? (
            <ul className="break-list" aria-label="Breaks">
              {show.schedule.breaks.map((entry, index) => (
                <li key={`${entry.afterEpisode}-${index}`}>
                  <span>{capitalize(describeBreak(entry))}</span>
                  <button
                    className="text-btn"
                    type="button"
                    onClick={() => onRemoveBreak(index)}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="field">
          <label htmlFor={id('start-ep')}>Episode on start date</label>
          <input
            id={id('start-ep')}
            type="number"
            min="1"
            value={show.schedule.startEpisode}
            onChange={(event) =>
              onUpdateSchedule('startEpisode', event.target.value)
            }
            required
          />
        </div>

        {show.schedule.mode === 'finite' ? (
          <div className="field">
            <label htmlFor={id('count')}>Episodes in season</label>
            <input
              id={id('count')}
              type="number"
              min="1"
              value={show.schedule.episodeCount}
              onChange={(event) =>
                onUpdateSchedule('episodeCount', event.target.value)
              }
              required
            />
          </div>
        ) : null}

        {show.malId ? (
          <div className="field">
            <label>MAL linked</label>
            <p className="hint">
              Linked to MAL ID {show.malId}.{' '}
              <button
                className="text-btn"
                type="button"
                onClick={onToggleMalEdit}
              >
                {malEditOpen ? 'Hide' : 'Edit'}
              </button>
            </p>
            {malEditOpen ? (
              <input
                id={id('mal')}
                type="number"
                min="1"
                value={show.malId}
                onChange={(event) => onUpdate('malId', event.target.value)}
                placeholder="39535"
              />
            ) : null}
          </div>
        ) : (
          <div className="field">
            <label htmlFor={id('mal')}>MAL anime ID</label>
            <input
              id={id('mal')}
              type="number"
              min="1"
              value={show.malId}
              onChange={(event) => onUpdate('malId', event.target.value)}
              placeholder="39535"
            />
            <p className="hint">
              Leave blank to auto-match from the title on load, or enter the ID
              from myanimelist.net/anime/
              <strong>39535</strong>/...
            </p>
          </div>
        )}

        <div className="field">
          <label htmlFor={id('reddit')}>Reddit search title</label>
          <input
            id={id('reddit')}
            value={show.redditSearchTitle}
            onChange={(event) =>
              onUpdate('redditSearchTitle', event.target.value)
            }
            placeholder="mushoku_tensei_jobless_reincarnation_season_3"
          />
          <p className="hint">
            Override when r/anime thread slugs do not match the show title.
          </p>
        </div>

        <div className="field">
          <label htmlFor={id('batch')}>Episodes on premiere day</label>
          <input
            id={id('batch')}
            type="number"
            min="1"
            value={show.schedule.premiereBatchSize}
            onChange={(event) =>
              onUpdateSchedule('premiereBatchSize', event.target.value)
            }
            required
          />
        </div>

        <div className="actions">
          {show.id && malLinked ? (
            <>
              <button
                className="btn btn-secondary"
                type="button"
                disabled={completingShow || malBlocked}
                title={malBlocked ? MAL_DOWN_MESSAGE : undefined}
                onClick={onComplete}
              >
                Mark as completed
              </button>
              <button
                className="btn btn-secondary"
                type="button"
                disabled={completingShow || malBlocked || holding}
                title={malBlocked ? MAL_DOWN_MESSAGE : undefined}
                onClick={onHold}
              >
                {holding ? 'Saving…' : 'On hold'}
              </button>
            </>
          ) : null}
          <button className="btn btn-danger" type="button" onClick={onRemove}>
            Remove show
          </button>
        </div>
      </div>
    </details>
  )
}
