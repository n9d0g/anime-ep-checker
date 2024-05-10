import * as cheerio from 'cheerio'

const getEpisodes = async () => {
  const episodeData = []

  try {
    const response = await fetch(
      'https://www.crunchyroll.com/series/GYZJ43JMR/that-time-i-got-reincarnated-as-a-slime',
      {
        method: 'GET',
        credentials: 'include',
        headers: {
          userAgent:
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.90 Safari/537.36',
        },
      }
    )
    const text = await response.text()

    const $ = cheerio.load(text)

    $('#content > div > div > div:nth-child(2)').each((index, element) => {
      console.log(element)
    })
  } catch (error) {
    throw error
  }
}

getEpisodes()
