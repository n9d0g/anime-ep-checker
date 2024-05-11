import { JSONFilePreset } from 'lowdb/node'

export const getDB = async () => {
  const db = await JSONFilePreset('db.json', {
    eps: {},
  })

  return db
}
