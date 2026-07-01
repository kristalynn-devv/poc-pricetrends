import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { existsSync } from 'node:fs'

defineRouteMeta({
  openAPI: {
    tags: ['Core'],
    summary: 'Raw JSONL log entries for a day',
    parameters: [{ name: 'date', in: 'query', required: false, schema: { type: 'string' }, description: 'YYYYMMDD, defaults to today' }],
    responses: {
      200: {
        description: 'empty array if the file does not exist yet',
        content: {
          'application/json': {
            schema: { type: 'object', properties: { date: { type: 'string' }, entries: { type: 'array', items: { type: 'object' } } } },
          },
        },
      },
    },
  },
})

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const date = typeof query.date === 'string' ? query.date : new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const path = join(process.cwd(), 'output', 'logs', `${date}.jsonl`)
  if (!existsSync(path)) return { date, entries: [] }
  const raw = await readFile(path, 'utf8')
  const entries = raw.split('\n').filter(Boolean).map((l) => {
    try { return JSON.parse(l) } catch { return null }
  }).filter(Boolean)
  return { date, entries }
})
