import puppeteer from 'puppeteer'

const url =
  'https://gogoanimeapp.com/category/tensei-shitara-slime-datta-ken-2nd-season-part-2'

const main = async () => {
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

  console.log(eps)

  await browser.close()
}

main()
