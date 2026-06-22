import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { existsSync } from 'node:fs'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const file = typeof query.file === 'string' ? query.file : null
  if (!file) throw createError({ statusCode: 400, message: 'file required' })

  const safe = file.replace(/\.\./g, '').replace(/^\/+/, '').replace(/\//g, '')
  const filePath = join(process.cwd(), 'output', 'screenshots', safe)

  if (!existsSync(filePath)) throw createError({ statusCode: 404, message: 'not found' })
  const buffer = await readFile(filePath)
  setResponseHeader(event, 'Content-Type', 'image/jpeg')
  setResponseHeader(event, 'Cache-Control', 'public, max-age=86400')
  return buffer
})
