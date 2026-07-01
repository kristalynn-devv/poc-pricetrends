import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

process.env.NUXT_PAGES_STATIC = '1'
process.env.SKIP_PLAYWRIGHT = '1'

execSync('node node_modules/nuxt/bin/nuxt.mjs build', {
  stdio: 'inherit',
  env: process.env,
  cwd: root,
})
