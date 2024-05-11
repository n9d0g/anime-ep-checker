import cron from 'node-cron'
import { runCron } from './runCron.js'

cron.schedule('* * * * *', async () => {
  console.log(`checking for new episodes - ${new Date().toLocaleString()}`)
  runCron()
})
