'use client'

import { useEffect, useMemo, useState } from 'react'
import { AnimeSheet } from '@/app/components/AnimeSheet'
import { SegmentedControl } from '@/app/components/SegmentedControl'
import {
  SHEET_FIELDS_CLASS,
  SheetActions,
  SheetSection,
} from '@/app/components/Sheet'
import {
  hasKnownEpisodeCount,
  hasKnownStartAt,
  unknownWatchFieldLabels,
  watchFormDefaults,
} from '@/lib/ptw-watch'
import type { PlanToWatchSnapshotEntry, ShowProvider } from '@shared/types'
import type { ShowFormValues } from '@/lib/types'
import { Field, FieldDescription } from '@/components/ui/field'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

function providerUrlField(provider: ShowProvider): {
  key: 'crunchyrollUrl' | 'netflixUrl' | 'disneyUrl'
  label: string
  placeholder: string
} {
  if (provider === 'netflix') {
    return {
      key: 'netflixUrl',
      label: 'Netflix title URL',
      placeholder: 'https://www.netflix.com/title/...',
    }
  }

  if (provider === 'disney') {
    return {
      key: 'disneyUrl',
      label: 'Disney+ title URL',
      placeholder: 'https://www.disneyplus.com/browse/entity-...',
    }
  }

  return {
    key: 'crunchyrollUrl',
    label: 'Crunchyroll series URL',
    placeholder: 'https://www.crunchyroll.com/series/...',
  }
}

function formatUnknownList(labels: string[]): string {
  if (labels.length === 1) {
    return labels[0]
  }

  if (labels.length === 2) {
    return `${labels[0]} and ${labels[1]}`
  }

  return `${labels.slice(0, -1).join(', ')}, and ${labels[labels.length - 1]}`
}

// Moving a Plan to watch show to Watching, in its own sheet: the fields MAL
// couldn't fill, pre-filled with what it could. Used from Plan to watch and
// from the Watching inbox.
export function MoveToWatchingSheet({
  entry,
  submitting,
  onClose,
  onSubmit,
}: {
  entry: PlanToWatchSnapshotEntry
  submitting: boolean
  onClose: () => void
  onSubmit: (values: ShowFormValues) => void
}) {
  const [form, setForm] = useState<ShowFormValues>(() =>
    watchFormDefaults(entry)
  )

  useEffect(() => {
    setForm(watchFormDefaults(entry))
  }, [entry])

  const unknownLabels = useMemo(() => unknownWatchFieldLabels(entry), [entry])
  const startKnown = hasKnownStartAt(entry)
  const episodeCountKnown = hasKnownEpisodeCount(entry)
  const urlField = providerUrlField(form.provider)

  function update<K extends keyof ShowFormValues>(
    field: K,
    value: ShowFormValues[K]
  ) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  function updateSchedule(
    field: keyof ShowFormValues['schedule'],
    value: string
  ) {
    setForm((current) => ({
      ...current,
      schedule: {
        ...current.schedule,
        [field]: value,
      },
    }))
  }

  return (
    <AnimeSheet
      title={entry.title}
      titleEnglish={entry.titleEnglish}
      coverUrl={entry.coverUrl}
      meta="Move to Watching"
      onClose={submitting ? () => {} : onClose}
    >
      <SheetSection title="Setup">
        <FieldDescription>
          Fill in {formatUnknownList(unknownLabels)}. Known details from
          MyAnimeList are already filled in.
        </FieldDescription>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            onSubmit(form)
          }}
        >
          <div className={SHEET_FIELDS_CLASS}>
            <Field>
              <Label asChild>
                <span id="ptw-provider-label">Streaming service</span>
              </Label>
              <SegmentedControl
                ariaLabel="Streaming service"
                value={form.provider}
                options={[
                  { value: 'crunchyroll', label: 'Crunchyroll' },
                  { value: 'netflix', label: 'Netflix' },
                  { value: 'disney', label: 'Disney+' },
                ]}
                onChange={(value) => update('provider', value)}
              />
            </Field>

            <Field>
              <Label htmlFor="ptw-watch-url">{urlField.label}</Label>
              <Input
                id="ptw-watch-url"
                value={form[urlField.key]}
                onChange={(event) => update(urlField.key, event.target.value)}
                placeholder={urlField.placeholder}
                required
              />
            </Field>

            <Field>
              <Label asChild>
                <span id="ptw-mode-label">Schedule type</span>
              </Label>
              <SegmentedControl
                ariaLabel="Schedule type"
                value={form.schedule.mode}
                options={[
                  { value: 'finite', label: 'Finite season' },
                  { value: 'ongoing', label: 'Ongoing' },
                ]}
                onChange={(value) => updateSchedule('mode', value)}
              />
            </Field>

            <Field>
              <Label htmlFor="ptw-watch-start">
                Start date and time (Japan Time / JST)
              </Label>
              <Input
                id="ptw-watch-start"
                type="datetime-local"
                value={form.schedule.startAt}
                onChange={(event) =>
                  updateSchedule('startAt', event.target.value)
                }
                required
              />
              {startKnown ? null : (
                <FieldDescription>
                  MAL did not have a full start date and time.
                </FieldDescription>
              )}
            </Field>

            <div className="field-row field-row-2">
              <Field>
                <Label htmlFor="ptw-watch-start-ep">
                  Episode on start date
                </Label>
                <Input
                  id="ptw-watch-start-ep"
                  type="number"
                  min="1"
                  value={form.schedule.startEpisode}
                  onChange={(event) =>
                    updateSchedule('startEpisode', event.target.value)
                  }
                  required
                />
              </Field>

              {form.schedule.mode === 'finite' ? (
                <Field>
                  <Label htmlFor="ptw-watch-count">Episodes in season</Label>
                  <Input
                    id="ptw-watch-count"
                    type="number"
                    min="1"
                    value={form.schedule.episodeCount}
                    onChange={(event) =>
                      updateSchedule('episodeCount', event.target.value)
                    }
                    required
                  />
                  {episodeCountKnown ? null : (
                    <FieldDescription>
                      MAL does not list an episode count yet.
                    </FieldDescription>
                  )}
                </Field>
              ) : null}
            </div>
          </div>
          <SheetActions sticky>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Moving…' : 'Move to Watching'}
            </Button>
          </SheetActions>
        </form>
      </SheetSection>
    </AnimeSheet>
  )
}
