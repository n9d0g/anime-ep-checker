import express from 'express'
import { gogo } from './lib/gogo.js'
import db from './lib/db.js'
import { gogoData } from './data/gogoData.js'
import './lib/cron.js'

const app = new express()

app.get('/gogo', async (req, res, next) => {
  console.log('checking for new episodes...')
  const episodes = await gogo(gogoData[0])

  const { eps } = await db.data

  return res.json(episodes)
})

app.listen(2093, () => console.log(`running on http://localhost:2093/gogo`))
