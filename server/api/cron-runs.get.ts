import { readRecentCronRuns } from '../utils/cronRunStore'

export default defineEventHandler(async () => {
  return readRecentCronRuns(30)
})
