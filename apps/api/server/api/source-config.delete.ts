import { deleteSourceCategoryConfig } from '../utils/sourceConfigStore'

defineRouteMeta({
  openAPI: {
    tags: ['Cron'],
    summary: 'Reset per-source config for one source back to defaults',
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: { type: 'object', required: ['name'], properties: { name: { type: 'string' } } },
        },
      },
    },
    responses: {
      200: { description: 'ok', content: { 'application/json': { schema: { type: 'object' } } } },
      400: { description: 'missing name' },
    },
  },
})

export default defineEventHandler(async (event) => {
  const body = await readBody<{ name?: string }>(event)
  const name = body?.name
  if (!name) {
    throw createError({ statusCode: 400, message: 'missing name' })
  }
  await deleteSourceCategoryConfig(name)
  return { ok: true }
})
