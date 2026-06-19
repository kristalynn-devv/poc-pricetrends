import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { existsSync } from 'node:fs'

export default defineEventHandler(async (event) => {
  const filename = getRouterParam(event, 'filename') ?? ''
  if (!filename || filename.includes('..') || filename.includes('/')) {
    throw createError({ statusCode: 400, message: 'Invalid filename' })
  }
  const filePath = join(process.cwd(), 'output', 'screenshots', filename)
  if (!existsSync(filePath)) {
    throw createError({ statusCode: 404, message: 'Screenshot not found' })
  }
  const buffer = await readFile(filePath)
  setHeader(event, 'Content-Type', 'image/jpeg')
  setHeader(event, 'Cache-Control', 'public, max-age=86400')
  return buffer
})
