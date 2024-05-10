import axios from 'axios'
import cheerio from 'cheerio'

const getEpisodes = async () => {
  try {
    const response = await fetch(
      'https://www.amazon.ca/gcx/Deals/gfhz/events/?_encoding=UTF8&canBeEGifted=false&canBeGiftWrapped=false&categoryId=Deals&content-id=amzn1.sym.406e17d1-c023-4232-8873-3f71d018408b&getItByToday=false&getItByTomorrow=false&isLimitedTimeOffer=true&isPrime=false&pd_rd_r=e0f4d9e4-1c52-49f2-afe0-e3879a754514&pd_rd_w=dLUxO&pd_rd_wg=oITHs&pf_rd_p=406e17d1-c023-4232-8873-3f71d018408b&pf_rd_r=DEV2SSWPVTFVKADAEFHJ&ref_=pd_hp_d_atf_unk&scrollState=eyJpdGVtSW5kZXgiOjAsInNjcm9sbE9mZnNldCI6MTgxLjIzNDM3NX0%3D&sectionManagerState=eyJzZWN0aW9uVHlwZUVuZEluZGV4Ijp7ImFtYWJvdCI6MH19'
    )

    const text = await response.text()
    console.log(text)
  } catch (error) {
    throw error
  }
}

getEpisodes()
