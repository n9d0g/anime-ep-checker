import puppeteer from 'puppeteer'

export const gogoScraper = async (url) => {
  const browser = await puppeteer.launch()
  const page = await browser.newPage()

  await page.goto(url)

  const eps = await page.evaluate(() => {
    const title = document.querySelector('h1').innerHTML
    const episodes = Array.from(
      document.querySelectorAll('#episode_related > li')
    )
    const data = episodes.map((ep) => ({
      title: title,
      href: ep.querySelector('li a').getAttribute('href').trim(),
    }))

    return data
  })

  await browser.close()

  return eps
}

export const crunchyScraper = async (url) => {
  const browser = await puppeteer.launch()
  const page = await browser.newPage()

  await page.goto(url)

  const eps = await page.evaluate(() => {
    const title = document.querySelector('h1').innerHTML
    const episodes = Array.from(
      document.querySelectorAll('#episode_related > li')
    )
    const data = episodes.map((ep) => ({
      title: title,
      href: ep.querySelector('li a').getAttribute('href').trim(),
    }))

    return data
  })

  await browser.close()

  return eps
}
