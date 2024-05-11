import { JSONFilePreset } from 'lowdb/node'

const db = await JSONFilePreset('db.json', {
  eps: {},
})

export default db
