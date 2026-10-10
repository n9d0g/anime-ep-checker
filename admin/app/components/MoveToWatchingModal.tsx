'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  hasKnownEpisodeCount,
  hasKnownStartAt,
  unknownWatchFieldLabels,
  watchFormDefaults,
} from '@/lib/ptw-watch'
import type {
  PlanToWatchSnapshotEntry,
  ShowFormValues,
  ShowProvider,
} from '@/lib/types'

function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T
  options: Array<{ value: T; label: string }>
  onChange: (value: T) => void
  ariaLabel: string
}) {
  return (
    <div className="segmented" role="group" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={value === option.value ? 'active' : ''}
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

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

export function MoveToWatchingModal({
  entry,
  submitting,
  onCancel,
  onSubmit,
}: {
  entry: PlanToWatchSnapshotEntry
  submitting: boolean
  onCancel: () => void
  onSubmit: (values: ShowFormValues) => void
}) {
  const [form, setForm] = useState<ShowFormValues>(() =>
    watchFormDefaults(entry)
  )

  useEffect(() => {
    setForm(watchFormDefaults(entry))
  }, [entry])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !submitting) {
        onCancel()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onCancel, submitting])

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
    <div
      className="modal-overlay"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget && !submitting) {
          onCancel()
        }
      }}
    >
      <form
        className="modal-panel modal-panel-wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ptw-watch-title"
        onSubmit={(event) => {
          event.preventDefault()
          onSubmit(form)
        }}
      >
        <h2 id="ptw-watch-title" className="modal-title">
          Move {entry.title} to watching
        </h2>
        <p className="modal-subtitle">
          Fill in {formatUnknownList(unknownLabels)}. Known details from
          MyAnimeList are already filled in.
        </p>

        <div className="modal-form">
          <div className="field">
            <span id="ptw-provider-label">Streaming service</span>
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
          </div>

          <div className="field">
            <label htmlFor="ptw-watch-url">{urlField.label}</label>
            <input
              id="ptw-watch-url"
              value={form[urlField.key]}
              onChange={(event) => update(urlField.key, event.target.value)}
              placeholder={urlField.placeholder}
              required
            />
          </div>

          <div className="field">
            <span id="ptw-mode-label">Schedule type</span>
            <SegmentedControl
              ariaLabel="Schedule type"
              value={form.schedule.mode}
              options={[
                { value: 'finite', label: 'Finite season' },
                { value: 'ongoing', label: 'Ongoing' },
              ]}
              onChange={(value) => updateSchedule('mode', value)}
            />
          </div>

          <div className="field">
            <label htmlFor="ptw-watch-start">
              Start date and time (Japan Time / JST)
            </label>
            <input
              id="ptw-watch-start"
              type="datetime-local"
              value={form.schedule.startAt}
              onChange={(event) =>
                updateSchedule('startAt', event.target.value)
              }
              required
            />
            {startKnown ? null : (
              <p className="hint">
                MAL did not have a full start date and time.
              </p>
            )}
          </div>

          <div className="field-row field-row-2">
            <div className="field">
              <label htmlFor="ptw-watch-start-ep">Episode on start date</label>
              <input
                id="ptw-watch-start-ep"
                type="number"
                min="1"
                value={form.schedule.startEpisode}
                onChange={(event) =>
                  updateSchedule('startEpisode', event.target.value)
                }
                required
              />
            </div>

            {form.schedule.mode === 'finite' ? (
              <div className="field">
                <label htmlFor="ptw-watch-count">Episodes in season</label>
                <input
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
                  <p className="hint">
                    MAL does not list an episode count yet.
                  </p>
                )}
              </div>
            ) : null}
          </div>
        </div>

        <div className="modal-actions">
          <button
            className="btn btn-secondary"
            type="button"
            disabled={submitting}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button className="btn" type="submit" disabled={submitting}>
            {submitting ? 'Moving…' : 'Move to watching'}
          </button>
        </div>
      </form>
    </div>
  )
}
