'use client'

import { SegmentedControl } from '@/app/components/SegmentedControl'
import type { ShowFormValues } from '@/lib/types'
import type { ShowProvider } from '@shared/types'
import { Field, FieldDescription } from '@/components/ui/field'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

// The Setup section of a show's sheet: the fields saved to shows.json.
// Collapsed for existing shows unless asked to open. `rowKey` keeps input IDs
// unique per row.
export function ShowEditForm({
  rowKey,
  show,
  startHint,
  open,
  malEditOpen,
  officialSiteUrl,
  dirty,
  saving,
  onToggleMalEdit,
  onUpdate,
  onUpdateSchedule,
  onSave,
  onRevert,
}: {
  rowKey: string
  show: ShowFormValues
  startHint: string | null
  /** Starts expanded: a new show, or a field to focus. */
  open: boolean
  malEditOpen: boolean
  /** AniList's Official Site link, shown as the default. */
  officialSiteUrl: string | null | undefined
  /** Setup differs from what's saved. */
  dirty: boolean
  saving: boolean
  onToggleMalEdit: () => void
  onSave: () => void
  onRevert: () => void
  onUpdate: <K extends keyof ShowFormValues>(
    field: K,
    value: ShowFormValues[K]
  ) => void
  onUpdateSchedule: (
    field: keyof ShowFormValues['schedule'],
    value: string
  ) => void
}) {
  const id = (name: string) => `${name}-${rowKey}`

  return (
    <details className="sheet-section sheet-setup" open={open}>
      <summary>
        <h3 className="sheet-section-title">
          Setup
          {dirty && show.id ? (
            <span className="sheet-unsaved">Unsaved</span>
          ) : null}
        </h3>
      </summary>
      <div className="sheet-setup-body">
        <Field>
          <Label htmlFor={id('title')}>Title</Label>
          <Input
            id={id('title')}
            value={show.title}
            onChange={(event) => onUpdate('title', event.target.value)}
            placeholder="One Piece"
          />
        </Field>

        <Field>
          <Label asChild>
            <span id={id('provider-label')}>Provider</span>
          </Label>
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
        </Field>

        {show.provider === 'crunchyroll' ? (
          <Field>
            <Label htmlFor={id('url')}>Crunchyroll series URL</Label>
            <Input
              id={id('url')}
              value={show.crunchyrollUrl}
              onChange={(event) =>
                onUpdate('crunchyrollUrl', event.target.value)
              }
              placeholder="https://www.crunchyroll.com/series/..."
              required
            />
          </Field>
        ) : show.provider === 'netflix' ? (
          <Field>
            <Label htmlFor={id('netflix-url')}>Netflix title URL</Label>
            <Input
              id={id('netflix-url')}
              value={show.netflixUrl}
              onChange={(event) => onUpdate('netflixUrl', event.target.value)}
              placeholder="https://www.netflix.com/title/..."
              required
            />
          </Field>
        ) : (
          <Field>
            <Label htmlFor={id('disney-url')}>Disney+ title URL</Label>
            <Input
              id={id('disney-url')}
              value={show.disneyUrl}
              onChange={(event) => onUpdate('disneyUrl', event.target.value)}
              placeholder="https://www.disneyplus.com/browse/entity-..."
              required
            />
          </Field>
        )}

        <Field>
          <Label asChild>
            <span id={id('mode-label')}>Schedule type</span>
          </Label>
          <SegmentedControl
            ariaLabel="Schedule type"
            value={show.schedule.mode}
            options={[
              { value: 'finite', label: 'Finite season' },
              { value: 'ongoing', label: 'Ongoing' },
            ]}
            onChange={(value) => onUpdateSchedule('mode', value)}
          />
        </Field>

        <Field>
          <Label htmlFor={id('start')}>
            Start date and time (Japan Time / JST)
          </Label>
          <Input
            id={id('start')}
            type="datetime-local"
            value={show.schedule.startAt}
            onChange={(event) =>
              onUpdateSchedule('startAt', event.target.value)
            }
            required
          />
          {startHint ? (
            <FieldDescription className="schedule-start-hint">
              {startHint}
            </FieldDescription>
          ) : null}
        </Field>

        <Field>
          <Label htmlFor={id('start-ep')}>Episode on start date</Label>
          <Input
            id={id('start-ep')}
            type="number"
            min="1"
            value={show.schedule.startEpisode}
            onChange={(event) =>
              onUpdateSchedule('startEpisode', event.target.value)
            }
            required
          />
        </Field>

        {show.schedule.mode === 'finite' ? (
          <Field>
            <Label htmlFor={id('count')}>Episodes in season</Label>
            <Input
              id={id('count')}
              type="number"
              min="1"
              value={show.schedule.episodeCount}
              onChange={(event) =>
                onUpdateSchedule('episodeCount', event.target.value)
              }
              required
            />
          </Field>
        ) : null}

        {show.malId ? (
          <Field>
            <Label>MAL linked</Label>
            <FieldDescription>
              Linked to MAL ID {show.malId}.{' '}
              <button
                className="text-btn"
                type="button"
                onClick={onToggleMalEdit}
              >
                {malEditOpen ? 'Hide' : 'Edit'}
              </button>
            </FieldDescription>
            {malEditOpen ? (
              <Input
                id={id('mal')}
                type="number"
                min="1"
                value={show.malId}
                onChange={(event) => onUpdate('malId', event.target.value)}
                placeholder="39535"
              />
            ) : null}
          </Field>
        ) : (
          <Field>
            <Label htmlFor={id('mal')}>MAL anime ID</Label>
            <Input
              id={id('mal')}
              type="number"
              min="1"
              value={show.malId}
              onChange={(event) => onUpdate('malId', event.target.value)}
              placeholder="39535"
            />
            <FieldDescription>
              Leave blank to auto-match from the title on load, or enter the ID
              from myanimelist.net/anime/
              <strong>39535</strong>/...
            </FieldDescription>
          </Field>
        )}

        <Field>
          <Label htmlFor={id('reddit')}>Reddit search title</Label>
          <Input
            id={id('reddit')}
            value={show.redditSearchTitle}
            onChange={(event) =>
              onUpdate('redditSearchTitle', event.target.value)
            }
            placeholder="mushoku_tensei_jobless_reincarnation_season_3"
          />
          <FieldDescription>
            Override when r/anime thread slugs do not match the show title.
          </FieldDescription>
        </Field>

        <Field>
          <Label htmlFor={id('official-news')}>Official news URL</Label>
          <Input
            id={id('official-news')}
            type="url"
            value={show.officialNewsUrl}
            onChange={(event) =>
              onUpdate('officialNewsUrl', event.target.value)
            }
            placeholder={officialSiteUrl || 'https://example-anime.jp/news/'}
          />
          <FieldDescription>
            {officialSiteUrl
              ? "Override when the show's news page isn't AniList's official site."
              : 'AniList lists no official site; set the news page to watch for breaks.'}
          </FieldDescription>
        </Field>

        <Field>
          <Label htmlFor={id('batch')}>Episodes on premiere day</Label>
          <Input
            id={id('batch')}
            type="number"
            min="1"
            value={show.schedule.premiereBatchSize}
            onChange={(event) =>
              onUpdateSchedule('premiereBatchSize', event.target.value)
            }
            required
          />
        </Field>
        <div className="actions sheet-save-row">
          <Button type="button" disabled={!dirty || saving} onClick={onSave}>
            {saving ? 'Saving…' : show.id ? 'Save' : 'Add show'}
          </Button>
          {dirty && show.id ? (
            <Button
              variant="outline"
              type="button"
              disabled={saving}
              onClick={onRevert}
            >
              Revert
            </Button>
          ) : null}
        </div>
      </div>
    </details>
  )
}
