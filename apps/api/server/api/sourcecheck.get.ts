import { readLatestSourceCheckRun } from '../utils/sourcecheckStore'

defineRouteMeta({
  openAPI: {
    tags: ['Core'],
    summary: 'Latest source-check run',
    responses: {
      200: { description: 'SourceCheckRun | null', content: { 'application/json': { schema: { type: 'object', nullable: true } } } },
    },
  },
})

export default defineEventHandler(async () => {
  return await readLatestSourceCheckRun()
})
