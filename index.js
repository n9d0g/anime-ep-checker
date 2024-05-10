const axios = require('axios')
const cheerio = require('cheerio')

const fetchEpisodes = async () => {
  const eps = []

  try {
    const res = await fetch(url)
    const html = await res.text()
    console.log(html)
  } catch (error) {
    console.log(error)
  }
}

// fetchEpisodes()
