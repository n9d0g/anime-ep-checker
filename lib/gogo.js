import puppeteer from 'puppeteer'

export const gogo = async (url) => {
  const browser = await puppeteer.launch()
  const page = await browser.newPage()

  await page.goto(url)

  const eps = await page.evaluate(() => {
    const episodes = Array.from(
      document.querySelectorAll('#episode_related > li')
    )
    const data = episodes.map((ep) => ({
      title: ep.querySelector('li > a > .name').innerHTML,
      href: ep.querySelector('li a').getAttribute('href'),
    }))

    return data
  })

  await browser.close()

  return eps
}
