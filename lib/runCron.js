import db from './db.js'
import { gogoanime } from '../data/sites.js'
import { gogoScraper } from './scrapers.js'
import 'dotenv/config'
import nodemailer from 'nodemailer'

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.GOOGLE_EMAIL,
    pass: process.env.GOOGLE_EMAIL_PASSWORD,
  },
})

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
    await transporter.sendMail({
      from: `Anime Episode Checker <${process.env.GOOGLE_EMAIL}>`,
      to: 'nate@njil.dev',
      subject: `${ep.title} episode ${ep.epCount} out now!`,
      text: `new episode found! watch here: ${ep.latestEp}`,
      html: `<p>new episode found! watch here: ${ep.latestEp}</p>`,
    })

    console.log(`new episode found! watch here: ${ep.latestEp}`)
    await db.update(({ eps }) => eps && (eps[0] = ep))
  } else console.log('no new episodes 🥲')
}
