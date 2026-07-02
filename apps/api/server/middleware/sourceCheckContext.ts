import { markSourceCheckRequest } from '../utils/sourceCheckContext'

/**
 * /api/sourcecheck calls the real search routes internally (with ?sourceCheck=1 appended)
 * so it exercises the actual scraping logic. This middleware flags that request so
 * appendLog()/appendResult() can skip writing to the shared operational logs/results —
 * source-check runs get their own log at output/sourcecheck/, not mixed into the real ones.
 */
export default defineEventHandler((event) => {
  if (getRequestURL(event).searchParams.get('sourceCheck') === '1') {
    markSourceCheckRequest()
  }
})
