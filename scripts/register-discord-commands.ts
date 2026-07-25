const DISCORD_API = 'https://discord.com/api/v10'

const COMMANDS = [
  {
    name: 'next',
    description: 'List upcoming episode drops for tracked shows',
    type: 1,
  },
  {
    name: 'show',
    description: 'Show details for a tracked anime',
    type: 1,
    options: [
      {
        name: 'title',
        description: 'Show to look up',
        type: 3,
        required: true,
        autocomplete: true,
      },
    ],
  },
  {
    name: 'mal',
    description: 'Adjust MAL watched progress for a tracked show',
    type: 1,
    options: [
      {
        name: 'action',
        description: 'What to do',
        type: 3,
        required: true,
        choices: [
          { name: 'up', value: 'up' },
          { name: 'down', value: 'down' },
          { name: 'set', value: 'set' },
        ],
      },
      {
        name: 'show',
        description: 'Tracked show',
        type: 3,
        required: true,
        autocomplete: true,
      },
      {
        name: 'episode',
        description: 'Episode number (set only)',
        type: 4,
        required: false,
      },
    ],
  },
  {
    name: 'score-alert',
    description: 'Post a manual MAL score drop or pickup alert',
    type: 1,
    options: [
      {
        name: 'show',
        description: 'Tracked show',
        type: 3,
        required: true,
        autocomplete: true,
      },
      {
        name: 'kind',
        description: 'Alert type',
        type: 3,
        required: true,
        choices: [
          { name: 'pickup', value: 'pickup' },
          { name: 'drop', value: 'drop' },
        ],
      },
      {
        name: 'note',
        description: 'Optional note',
        type: 3,
        required: false,
      },
    ],
  },
]

async function getApplicationId(botToken: string): Promise<string> {
  const response = await fetch(`${DISCORD_API}/oauth2/applications/@me`, {
    headers: { Authorization: `Bot ${botToken}` },
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Failed to fetch application id (${response.status}): ${body}`)
  }

  const data = (await response.json()) as { id: string }
  return data.id
}

async function main() {
  const botToken = process.env.DISCORD_BOT_TOKEN?.trim()
  const guildId = process.env.DISCORD_GUILD_ID?.trim()

  if (!botToken || !guildId) {
    throw new Error('DISCORD_BOT_TOKEN and DISCORD_GUILD_ID are required.')
  }

  const applicationId = await getApplicationId(botToken)
  const response = await fetch(
    `${DISCORD_API}/applications/${applicationId}/guilds/${guildId}/commands`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bot ${botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(COMMANDS),
    }
  )

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Failed to register commands (${response.status}): ${body}`)
  }

  const registered = (await response.json()) as Array<{ name: string }>
  console.log(`Registered ${registered.length} guild slash commands:`)
  for (const command of registered) {
    console.log(`  /${command.name}`)
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
