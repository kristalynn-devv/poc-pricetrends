import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { existsSync } from 'node:fs'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const file = typeof query.file === 'string' ? query.file : null
  if (!file) throw createError({ statusCode: 400, message: 'file required' })

  // Prevent path traversal
  const safe = file.replace(/\.\./g, '').replace(/^\/+/, '')
  const filePath = join(process.cwd(), 'output', 'data', safe)

  if (!existsSync(filePath)) throw createError({ statusCode: 404, message: 'not found' })
  const content = await readFile(filePath, 'utf8')
  return JSON.parse(content)
})
