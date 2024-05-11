import cron from 'node-cron'
import { runCron } from './runCron.js'

// run every 30 seconds
cron.schedule('*/30 * * * * *', async () => {
  console.log(`checking for new episodes - ${new Date().toLocaleString()}`)
  runCron()
})
