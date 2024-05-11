import express from 'express'
import db from './lib/db.js'
import { crunchyroll, gogoanime } from './data/sites.js'
import { gogoScraper, crunchyScraper } from './lib/scrapers.js'
import './lib/cron.js'

const app = new express()

app.get('/gogo', async (req, res, next) => {
  console.log('checking for new episodes...')
  const episodes = await gogoScraper(gogoanime[0])

  const { eps } = await db.data

  return res.json(episodes)
})

app.listen(2093, () => console.log(`running on http://localhost:2093/gogo`))
