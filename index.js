import express from 'express'
import { gogo } from './lib/gogo.js'

const app = new express()

app.get('/scrape', async (req, res, next) => {
  console.log('scraping')

  const eps = await gogo(
    'https://gogoanime.gg/category/yoru-no-kurage-wa-oyogenai'
  )

  console.log(eps)

  res.json(eps)
})

app.listen(2093, () => console.log('running on port 2093'))
