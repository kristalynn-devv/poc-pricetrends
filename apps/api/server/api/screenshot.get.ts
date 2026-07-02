import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { apiError } from '../utils/errors'

defineRouteMeta({
  openAPI: {
    tags: ['Screenshot'],
    summary: 'Serve a saved screenshot (query param)',
    description: 'Equivalent to GET /api/screenshots/<filename>.',
    parameters: [{ name: 'file', in: 'query', required: true, schema: { type: 'string' } }],
    responses: {
      200: { description: 'raw JPEG image', content: { 'image/jpeg': { schema: { type: 'string', format: 'binary' } } } },
      400: { description: 'missing file' },
      404: { description: 'not found' },
    },
  },
})

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const file = typeof query.file === 'string' ? query.file : null
  if (!file) throw apiError(400, 'config', 'file required')

  const safe = file.replace(/\.\./g, '').replace(/^\/+/, '').replace(/\//g, '')
  const filePath = join(process.cwd(), 'output', 'screenshots', safe)

  if (!existsSync(filePath)) throw apiError(404, 'config', 'not found')
  const buffer = await readFile(filePath)
  setResponseHeader(event, 'Content-Type', 'image/jpeg')
  setResponseHeader(event, 'Cache-Control', 'public, max-age=86400')
  return buffer
})
