import { initCronScheduler } from '../utils/cronScheduler'

export default defineNitroPlugin(async () => {
  await initCronScheduler()
})
