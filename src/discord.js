import { formatTimingLabel } from './compare.js'

export async function sendEpisodeAlert({
  webhookUrl,
  show,
  latestSnapshot,
  timingStatus,
  expectedDropAt,
  actualDropAt,
}) {
  if (!webhookUrl) {
    throw new Error('DISCORD_WEBHOOK_URL is not set')
  }

  const episodeNumber = latestSnapshot.episode.episode
  const episodeTitle = latestSnapshot.episode.title
  const showTitle = show.title || latestSnapshot.seriesTitle
  const timingLabel = formatTimingLabel(timingStatus, expectedDropAt, actualDropAt)

  const payload = {
    embeds: [
      {
        title: `${showTitle} — Episode ${episodeNumber} is out`,
        url: latestSnapshot.watchUrl,
        description: episodeTitle,
        color: timingStatus === 'late' ? 0xe67e22 : 0x2ecc71,
        fields: [
          {
            name: 'Season',
            value: latestSnapshot.seasonTitle,
            inline: true,
          },
          {
            name: 'Timing',
            value: timingLabel,
            inline: false,
          },
        ],
        timestamp: actualDropAt ?? new Date().toISOString(),
        footer: {
          text: 'Anime Episode Checker',
        },
      },
    ],
  }

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Discord webhook failed (${response.status}): ${body}`)
  }
}
