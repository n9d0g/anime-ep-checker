import * as cheerio from 'cheerio'

const getEpisodes = async () => {
  const episodeData = []

  try {
    const response = await fetch(
      'https://webscraper.io/test-sites/e-commerce/allinone'
    )

    const text = await response.text()
    const $ = cheerio.load(text)

    $(
      '.wrapper > .container > .row > .col-lg-9 > .row > .col-md-4 > .card > .product-wrapper'
    ).each((index, element) => {
      let title = $(element).find('.caption > h4:nth-child(2) > a').text()

      episodeData.push({
        title,
      })
    })
  } catch (error) {
    throw error
  }

  console.log(episodeData)
}

getEpisodes()
