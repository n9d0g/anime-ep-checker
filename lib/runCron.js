import db from './db.js'
import { gogoanime } from '../data/sites.js'
import { gogoScraper } from './scrapers.js'

export const runGogoCron = async () => {
  const episodes = await gogoScraper(gogoanime[0])

  const { eps } = await db.data

  const ep = {
    title: episodes[0].title,
    latestEp: episodes[0].href,
    epCount: episodes.length,
  }

  // if it's not in the db, add it
  if (eps.filter((e) => e.title === ep.title).length === 0) {
    console.log(`adding ${ep.title} to db 🎉`)
    await db.update(({ eps }) => eps.push(ep))
  }
  // if there's a new episode
  else if (eps[0].epCount !== ep.epCount) {
    console.log(`new episode found! watch here: ${ep.latestEp}`)
    await db.update(({ eps }) => eps && (eps[0] = ep))
  } else console.log('no new episodes 🥲')
}
