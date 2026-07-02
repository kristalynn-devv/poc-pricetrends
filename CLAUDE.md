# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

PoC price extraction tool — user points at a Thai secondary-market webpage, the app takes a silent Playwright screenshot, then sends it to Gemini to extract structured product data according to a per-category template.

pnpm workspace monorepo: `apps/api` (standalone Nitro backend, Playwright + Gemini) + `apps/web` (Nuxt 4 SPA frontend, Vuetify 3) + `packages/shared` (plain TS, no build step). No Python.

## Commands

```bash
pnpm install         # installs all 3 workspaces; apps/api's postinstall also runs `playwright install chromium`
pnpm dev             # runs both apps in parallel — api: http://localhost:8080, web: http://localhost:3000
pnpm dev:api         # api only
pnpm dev:web         # web only
pnpm build           # builds both (pnpm -r build)
pnpm preview         # previews both built apps
pnpm build:pages     # web only — Cloudflare Pages static build (no Playwright needed)
```

Each app can also be run directly: `pnpm --filter poc-pricetrends-api dev`, `pnpm --filter poc-pricetrends-web dev`.

**apps/web talks to apps/api over HTTP, cross-origin.** `apps/web/.env` sets `NUXT_PUBLIC_API_BASE=http://localhost:8080` — required for local dev, not just production, since the two apps are separate processes/ports now.

## Architecture

**Nuxt 4 source layout**: app code under `apps/web/app/` (pages, layouts, composables). Backend under `apps/api/server/api/` (Nitro file-based routing, standalone — not embedded in Nuxt).

**Workflow:**
1. User enters a URL + selects category (or uploads an image manually)
2. กด "ถ่ายรูป" → `POST /api/analyze` — Playwright ถ่าย + Gemini extract ในครั้งเดียว บันทึกภาพอัตโนมัติ
3. ผลลัพธ์แสดงใน UI ทันที (ไม่ต้องกดปุ่มแยก)

**Swagger/OpenAPI docs** — Nitro's built-in generator, no extra dependency. Enabled via `experimental.openAPI` + `openAPI` in `apps/api/nitro.config.ts`. Live at `http://localhost:8080/docs` (Swagger UI, renamed from Nitro's default `/_swagger` via `openAPI.ui.swagger.route`), `/reference` (Scalar UI, renamed from default `/_scalar` via `openAPI.ui.scalar.route`), `/openapi.json` (raw spec, renamed from default `/_openapi.json` via `openAPI.route`) — standard REST-API doc path convention, works in both `pnpm dev:api` and `pnpm --filter poc-pricetrends-api preview`. Each route declares its schema via `defineRouteMeta({ openAPI: {...} })` at the top of the route file (auto-imported, no import needed) — **must be a literal object**, not a call to a shared helper function (Nitro's build-time extractor only walks static AST literals, so batch-search routes each inline their own copy of the same shape instead of sharing one). `tags` group routes in the Swagger/Scalar UI: `Analyze` (analyze/extract), `Screenshot`, `Cron`, `Logs`, `Results`, `Source Check`, `Batch Search` (the 17 `*-search.post.ts` routes).

**Server routes** (all under `apps/api/server/api/` — see `apps/api/API.md` for full request/response docs):
- `server/api/analyze.post.ts` — **main endpoint**: screenshot + extract + save ในครั้งเดียว → `{ filename, base64, mimeType, items[] }`
- `server/api/screenshot.post.ts` — standalone screenshot → `{ base64, mimeType, filename }`
- `server/api/extract.post.ts` — standalone Gemini extraction → `{ items[] }`
- `GET /api/screenshot?file=` — serve screenshot image from `output/screenshots/`
- `GET /api/results/entries?date=YYYYMMDD` — daily extracted results (`output/results/`)
- `GET /api/results/entries?date=YYYYMMDD&screenshotFile=` — single result by screenshot filename
- `GET /api/logs/entries?date=YYYYMMDD` — raw JSONL log entries for a given day
- `GET /api/logs/summary?date=YYYYMMDD` — daily summary (total/success/failed, bySource, byCategory, avgDuration)
- `POST /api/sourcecheck` — รัน source check จริงกับทุก source (หรือ 1 source ถ้าส่ง `{ source }`) ด้วย query ตัวอย่างต่อหมวด, บันทึกผลที่ `output/sourcecheck/YYYYMMDD.jsonl`, คืน `SourceCheckRun`
- `GET /api/sourcecheck` — อ่านผล source check รันล่าสุด
- `GET /api/sourcecheck/history?date=YYYYMMDD` — ทุก run ของวันนั้น + `availableDates` (วันที่มีข้อมูล) สำหรับ UI ดูย้อนหลัง
- `GET /api/cron-config` — cron config ทุกหมวด (merge กับ default ถ้ายังไม่เคยตั้งค่า)
- `POST /api/cron-config` — บันทึก cron config ของ 1 หมวด (`{ label, config }`) แล้ว reschedule ทันที
- `GET /api/cron-runs` — ประวัติการรัน cron ล่าสุด (30 รายการ, ข้าม `output/cron-runs/`)

**Batch-search routes** — รับ `{ query, categoryId, limit, screenshotConfig? }` แล้ว scrape listing page → ถ่ายแต่ละ item + Gemini extract → `{ results[], logs[] }`

Route files ทั้งหมด 17 ไฟล์อยู่ที่ `apps/api/server/api/*-search.post.ts` ทุก route ผูก `apiRoute` ใน `packages/shared/constants/categoryGroups.ts` แล้วทั้งหมด:

| Route | Site | หมวด |
|---|---|---|
| `chrono24-search` | chrono24.com | 103 |
| `auctionhouse-search` | auctionhouse.co.th | 103/106/107/108/109/110/111/112 |
| `radiumwatch-search` | radiumwatch.com | 103 |
| `siamwatchclub-search` | siamwatchclub.com | 103 |
| `komehyo-search` | komehyo.co.th | 103/108/110 |
| `thaprachan-search` | thaprachan.com | 106 |
| `wutdychonburi-search` | wutdychonburi.com | 106 |
| `prapantip-search` | prapantip.com | 106 |
| `uauction-search` | uauction.uamulet.com | 106 |
| `shopbkk-search` | shopbkk.com | 107/109/112 |
| `compasia-search` | compasia.co.th | 107/109/112 |
| `kaidee-search` | kaidee.com | 107/109/111/112 |
| `sasom-search` | sasom.co.th | 108/110 |
| `moppet-search` | moppetbrandname.com | 108/110 |
| `sfbrandname-search` | sfbrandname.com | 108/110 |
| `brandnamevoyage-search` | brandnamevoyage.com | 108/110 |
| `truck2hand-search` | truck2hand.com | 111 |

Source list ทั้งหมดนิยามใน `packages/shared/constants/categoryGroups.ts` (`CATEGORY_GROUPS`) — เป็น single source of truth ใช้ร่วมกันทั้ง client (`useSearchGroupsStore().init()`) และ server (`cronRunner.ts`)

**เพิ่ม source ใหม่ต้องทำพร้อมกัน 2 ที่**: route file (`apps/api/server/api/`) + `packages/shared/constants/categoryGroups.ts`

**Search route factory** (`apps/api/server/utils/searchRouteFactory.ts`) — สำหรับ source ที่เป็น "simple shape" (ไม่มี bot protection, ไม่ persist browser/cookie, ไม่ pagination, ใช้ CSS selector เดียวหา listing links) ให้ใช้ `defineSearchRoute(config)` แทนการเขียน route ทั้งไฟล์เอง — encapsulate stream wiring/stealth browser/screenshot→Gemini extract→sanitize→persist loop/concurrency/error handling ไว้ให้แล้ว route file เหลือแค่ `defineRouteMeta({ openAPI: {...} })` (ต้องเป็น literal object ตามเดิม) + `defineSearchRoute({ sourceKey, siteName, sourceCode, defaultCategoryId, buildSearchUrl, linkSelector, ... })`. รองรับ hook `beforeCollectLinks`/`beforeScreenshot` สำหรับ site ที่ต้องมี step พิเศษเล็กน้อย (เช่น fill+submit search box, ซ่อน element ก่อนถ่าย) โดยไม่ต้องหลุดจาก factory
- ใช้กับ: `kaidee-search`, `moppet-search`, `prapantip-search`, `shopbkk-search`, `truck2hand-search`, `uauction-search`
- ยังคง bespoke (ไม่ใช้ factory เพราะ logic ต่างจาก simple shape มาก): `auctionhouse-search` (persistent context + bot-retry + pagination), `komehyo-search` (interactive search-box submission), `sfbrandname-search` (multi-strategy link discovery), `compasia-search` (multi-pass slug matching), `chrono24-search` (multi-selector fallback chain)

## Rules

- **อัปเดต CLAUDE.md ทุกครั้งที่มีการเปลี่ยนแปลง** — เมื่อเพิ่ม route, utility, component, หรือเปลี่ยน architecture ให้อัปเดต CLAUDE.md ให้ตรงกับ code จริงเสมอ

- **ใช้ helper กลางเสมอ** — ถ้า logic เดิมมีอยู่ใน `apps/api/server/utils/` ให้ import มาใช้ อย่า copy หรือ reimplement ใหม่ในแต่ละ route:
  - stealth browser → `createStealthContext()` จาก `browserUtils.ts`
  - ปิด cookie popup → `dismissCookieBanner()` จาก `browserUtils.ts`
  - scroll lazy content → `scrollForLazyContent()` จาก `browserUtils.ts`
 - screenshot options/viewport → `mergeScreenshotConfig()` + `buildScreenshotOptions()` จาก `screenshotConfig.ts`
 - ถ่าย screenshot → `takeScreenshot()` จาก `browserUtils.ts`
 - สร้างชื่อไฟล์ screenshot → `buildScreenshotFilename()` / `buildUrlScreenshotFilename()` จาก `filename.ts`
 - สร้าง Gemini prompt → `buildExtractPrompt()` + `buildSchema()` จาก `extractPrompt.ts`
  - บันทึก result → `persistExtraction()` จาก `persistExtraction.ts` (เขียน `results/` + `logs/` พร้อมกัน)
  - บันทึก log อย่างเดียว (error cases) → `appendLog()` จาก `logger.ts`
  - API types/constants → import จาก `#shared` (ไม่ duplicate ใน server/utils)
  - coerce price → `sanitizeItems()` จาก `sanitize.ts`
- **ถ้า logic ซ้ำกัน 2+ route ให้ย้ายไป `apps/api/server/utils/`** ก่อนแล้วค่อย import
- **field definitions** มี 2 ที่ ใช้ให้ถูก:
  - **server** → `CATEGORY_FIELDS` + `buildSchema()` จาก `extractPrompt.ts` (สำหรับสร้าง Gemini prompt)
  - **frontend** → `useCategoryFields.ts` composable (สำหรับ UI required/optional fields)
  - อย่านิยาม field list ซ้ำในที่อื่น

**Category run config** (จำนวน source และจำนวนชิ้น/source ต่อหมวด):
- `packages/shared/types/categoryConfig.ts` — `CategoryRunConfig { maxSources, itemsPerSource }`
- `packages/shared/utils/categoryConfig.ts` — `DEFAULT_CATEGORY_RUN_CONFIG` (maxSources=3, itemsPerSource=1) + `mergeCategoryRunConfig()` helper กลาง (pattern เดียวกับ `screenshotConfig.ts`)
- `apps/web/app/stores/categoryConfig.ts` — `useCategoryConfigStore()`: persist ต่อหมวด (key = `grp.label`) ใน localStorage (`categoryRunConfigs_v1`) เหมือน `useSourceConfigStore`
- UI: ปุ่มเฟือง (⚙ `mdi-cog-outline`) ที่หัว panel แต่ละหมวดใน `index.vue` เปิด dialog ตั้ง `maxSources` (จำกัดจำนวน source ที่ดึงต่อรอบ — แทนค่าคงที่ `TARGET_HITS`/`CONCURRENCY` เดิมใน `runGroup()`) และ `itemsPerSource` (ค่า default ของ `limit` ต่อ source เมื่อ source นั้นไม่มี per-source override จาก `useSourceConfigStore`)
- `searchGroups.ts` → `runGroup(grp, getCfg, categoryCfg)` รับ `CategoryRunConfig` เป็น param ที่ 3 (default `DEFAULT_CATEGORY_RUN_CONFIG`)

**Category groups** (`packages/shared/constants/categoryGroups.ts`):
- `CATEGORY_GROUPS` — **single source of truth** ของ label/ids/sources ต่อหมวด ใช้ร่วมกันทั้ง client (`useSearchGroupsStore().init()`) และ server (`cronRunner.ts`)
- เพิ่ม source ใหม่แก้ที่นี่ที่เดียว (ไม่ต้องแก้ `index.vue`/`searchGroups.ts` อีก) + route file

**Cron (รันค้นหาอัตโนมัติตามตารางเวลา):**
- กลไก: `node-cron` ฝังใน Nitro server plugin — รันอยู่ใน process เดียวกับ `apps/api` (`pnpm dev:api`/`pnpm --filter poc-pricetrends-api preview`) เท่านั้น (ไม่ใช่ Windows Task Scheduler แยกต่างหาก, backend process ต้องเปิดค้างไว้ถึงจะ trigger — ไม่ขึ้นกับว่า apps/web เปิดอยู่หรือไม่)
- `packages/shared/types/cronConfig.ts` — `CronCategoryConfig { enabled, cronExpression, queries, maxSources, itemsPerSource }`
- `packages/shared/utils/cronConfig.ts` — `DEFAULT_CRON_CONFIG` (disabled, `0 8 * * *`) + `mergeCronConfig()` + `isValidCronExpression()`
- `apps/api/server/utils/cronConfigStore.ts` — persist cron config ต่อหมวดที่ `apps/api/output/cron-config.json`
- `apps/api/server/utils/cronRunner.ts` — `runCategoryCron(label, cfg, baseUrl)`: เรียก search route จริงของแต่ละ source (จำกัดที่ `cfg.maxSources`) × ทุก query ใน `cfg.queries`, จำนวนพร้อมกัน 1–3 — แต่ละ route persist ผลลัพธ์ของตัวเองอยู่แล้ว (`persistExtraction`), cronRunner แค่ drain NDJSON stream ให้ครบ (pattern เดียวกับ `sourcecheck.ts`)
- `apps/api/server/utils/cronRunStore.ts` — บันทึกประวัติการรัน (`CronRunLogEntry`) ที่ `apps/api/output/cron-runs/YYYYMMDD.jsonl`
- `apps/api/server/utils/cronScheduler.ts` — `scheduleCategory(label)` (register/reschedule 1 หมวด) + `initCronScheduler()` (เรียกตอน server start จาก `server/plugins/cron.ts`); internal fetch ใช้ `http://localhost:${PORT}` (default 8080)
- `apps/api/server/api/cron-config.get.ts` / `.post.ts` — อ่าน/บันทึก config ต่อหมวด, POST เรียก `scheduleCategory()` ทันทีเพื่อ reschedule โดยไม่ต้อง restart server
- `apps/api/server/api/cron-runs.get.ts` — ประวัติการรันล่าสุด
- UI: ปุ่มนาฬิกา (🕐 `mdi-clock-outline`) ที่หัว panel แต่ละหมวดใน `index.vue` เปิด dialog ตั้ง enable/cron expression/query list/maxSources/itemsPerSource + แสดงประวัติรันล่าสุดของหมวดนั้น
- `apps/web/app/stores/cronConfig.ts` — `useCronConfigStore()`: fetch/save ผ่าน API (ไม่ใช่ localStorage เพราะ cron ต้องรันฝั่ง server แม้ไม่มี browser เปิดอยู่)

**Screenshot config** (`apps/api/server/utils/screenshotConfig.ts`):
- ค่า default: viewport 1920×1080, fullPage=true, quality=90
- ปรับได้จาก UI (ปุ่ม ⚙ หน้าหลัก) — ส่งมาใน request body เป็น `screenshotConfig` object
- fields: `viewportWidth`, `viewportHeight`, `fullPage`, `quality`, `clip` (x/y/width/height/enabled)
- Anti-bot: `--disable-blink-features=AutomationControlled` + real user-agent + `navigator.webdriver = undefined`
- Cookie popup: auto-dismiss (`Accept all`, `Agree`, `OK` ใน dialog)
- `waitUntil: 'load'` + 3s wait (ไม่ใช้ `networkidle` — timeout บนเว็บที่มี background requests)

**Filename utilities** (`apps/api/server/utils/filename.ts`):
- `fileTimestampPrefix()` — `YYYYMMDD_HHmmss` (UTC)
- `buildScreenshotFilename(...parts)` — `YYYYMMDD_HHmmss_{parts}.jpg`
- `buildUrlScreenshotFilename(url, categoryId?)` — สำหรับ analyze/screenshot route
- `sourceCode(url)` — map domain → 3-letter source code

**Browser utilities** (`apps/api/server/utils/browserUtils.ts`):
- `createStealthContext()` — สร้าง BrowserContext พร้อม stealth + viewport จาก screenshotConfig (รองรับ locale th-TH/en-US)
- `dismissCookieBanner()` — ปิด popup อัตโนมัติ (shared selectors ทุก route ใช้ร่วมกัน)
- `scrollForLazyContent()` — scroll ลงแล้วกลับขึ้น เพื่อ trigger lazy-load
- `takeScreenshot()` — ถ่าย screenshot ด้วย options จาก screenshotConfig

**Prompt utilities** (`apps/api/server/utils/extractPrompt.ts`):
- `buildExtractPrompt()` — สร้าง Gemini prompt ตาม category + mode (listing/detail)
- `buildSchema()` — สร้าง JSON schema description จาก categoryId หรือ template ที่กำหนดเอง
- `CATEGORY_FIELDS` — field list ต่อ category (export ใช้ใน route ได้)
- `getCategoryLabel()` — ชื่อหมวดหมู่ภาษาไทยต่อ categoryId

**Data storage** (ไม่ซ้ำซ้อน — แต่ละโฟลเดอร์มีหน้าที่เดียว, ทั้งหมดอยู่ใต้ `apps/api/output/` เพราะ `process.cwd()` คือ `apps/api/` ตอนรัน backend):
- `apps/api/output/screenshots/` — รูป JPG
- `apps/api/output/results/YYYYMMDD.jsonl` — **แหล่งเดียว** ของข้อมูลสินค้าที่ extract ได้ (1 entry ต่อ screenshot)
- `apps/api/output/logs/YYYYMMDD.jsonl` — operational log (duration, error, tokens, `screenshotFile` pointer)
- `apps/api/output/sourcecheck/YYYYMMDD.jsonl` — ผล source check ต่อรัน (1 บรรทัด = 1 `SourceCheckRun` ทั้งชุด)
- `apps/api/output/cron-config.json` — cron config ต่อหมวด (enable/cron expression/queries/maxSources/itemsPerSource)
- `apps/api/output/cron-runs/YYYYMMDD.jsonl` — ประวัติการรัน cron ต่อหมวด (1 บรรทัด = 1 `CronRunLogEntry`)

**Data utilities:**
- `apps/api/server/utils/sanitize.ts` — `sanitizeItems()`: coerce price เป็น integer, strip commas
- `apps/api/server/utils/persistExtraction.ts` — `persistExtraction()`: บันทึก `appendResult` + `appendLog` success ในครั้งเดียว
- `apps/api/server/utils/resultsStore.ts` — `appendResult()` / `readDailyResults()`: เขียน/อ่าน `output/results/YYYYMMDD.jsonl`
  - `ResultEntry` มี `roundId?` (batch run ID) และ `searchQuery?` สำหรับ group ผลลัพธ์
- `apps/api/server/utils/sourcecheck.ts` — `runSourceCheck()` / `runAllSourceChecks()`: เรียก search route จริงของแต่ละ source (query ตัวอย่างต่อหมวดใน `SOURCECHECK_QUERIES`, `limit: 1`, concurrency 1) โดยแปะ `?sourceCheck=1` ต่อท้าย URL แล้วอ่าน NDJSON stream เพื่อสรุป pass/fail (เจอสินค้า + ถ่ายภาพได้)
- `apps/api/server/utils/sourcecheckStore.ts` — `appendSourceCheckRun()` / `readLatestSourceCheckRun()` / `readSourceCheckRunsByDate(date)` / `listSourceCheckDates()`: เขียน/อ่าน `output/sourcecheck/YYYYMMDD.jsonl` (1 บรรทัด = 1 run, วันนึงมีได้หลาย run)
- **Log แยกจากของจริง**: `?sourceCheck=1` ทำให้ `server/middleware/sourceCheckContext.ts` ตั้ง flag แบบ request-scoped ผ่าน `AsyncLocalStorage` (`server/utils/sourceCheckContext.ts`) — `appendLog()` (`logger.ts`) และ `appendResult()` (`resultsStore.ts`) เช็ค flag นี้แล้ว skip การเขียนถ้าเป็น source-check request ผลคือรัน sourcecheck ไม่ปนกับ `output/logs/`/`output/results/` จริง (แต่ยังถ่าย screenshot ไฟล์จริงเหมือนเดิม เพราะต้องทดสอบของจริง) — ทำแบบนี้เพื่อไม่ต้องแก้ทุก route ไฟล์ (17 ไฟล์) ที่เรียก `appendLog`/`persistExtraction` ตรงๆ
- หน้า `/sourcecheck` (`apps/web/app/pages/sourcecheck.vue`, state เก็บใน `useSourceCheckStore` เพื่อไม่ให้หายตอนเปลี่ยนหน้า) — ปุ่มตรวจสอบ source ทั้งหมด + ตารางผลล่าสุด + ส่วนดูประวัติย้อนหลัง (date picker เหมือน `/logs`, ดึงจาก `GET /api/sourcecheck/history?date=`) ตารางผลใช้ component ร่วม `apps/web/app/components/SourceCheckResultTable.vue` (ตรวจ+รายงานเท่านั้น ไม่แก้ไข code อัตโนมัติ)

**File naming convention:** `[YYYYMMDD]_[HHmmss]_[CategoryID]_[SourceCode][_{suffix}].jpg`
- บันทึกที่ `apps/api/output/screenshots/`
- Source codes: `CHR`=chrono24, `SHP`=shopee, `LAZ`=lazada, `KAI`=kaidee, `FBK`=facebook, `MRC`=mercari, `EBY`=ebay, `YAH`=yahoo — domain อื่นใช้ 3 ตัวแรกของ domain อัตโนมัติ

**Result persistence:** batch-search routes ที่สำเร็จ save JSON ไปที่ `output/results/YYYYMMDD.jsonl` (1 entry ต่อ item) — ดูได้ที่ `/entries` (`apps/web/app/pages/entries.vue`)

**Gemini model:** `gemini-3.1-flash-lite`

**Category field templates** (นิยามใน `apps/web/app/composables/useCategoryFields.ts` — auto-import ใน index.vue):
- 103 นาฬิกา: brand, model (required) + optional: dialColor, caseMaterial, strapMaterial, movementType, condition
- 106 พระ/วัตถุมงคล: title, material (required) + optional: model, moldType, year, weight
- 107/109/112 IT: brand, model (required) + optional: itemType, capacity, condition
- 108/110 แบรนเนม: brand, model (required) + optional: itemType, year, condition
- 111 เครื่องมือช่าง: brand, model (required) + optional: itemType, condition
- price + currency เป็น common optional fields ของทุกหมวด

UI ให้ผู้ใช้เพิ่ม optional fields ได้ด้วย chip — ใส่ค่าแล้ว combine เป็น query string ส่งให้ route

`price` = ตัวเลขเท่านั้น, `currency` = สกุลเงิน (THB/USD/JPY/EUR) แยกกัน

**Credentials & env config:**
- `apps/api/.env` — `NUXT_GEMINI_API_KEY` (Gemini API key, server-only), `PORT` (default 8080), `NODE_OPTIONS`
- `apps/web/.env` — `NUXT_PUBLIC_API_BASE` (backend origin, e.g. `http://localhost:8080` — required for local dev now that apps are split, not just Cloudflare Pages)
- ดู `.env.example` ในแต่ละ app สำหรับ template

**Monorepo layout** (pnpm workspace — backend/frontend แยก process แล้ว):

```
apps/api/             # standalone Nitro backend (port 8080, ตั้งผ่าน PORT env)
  server/              # routing (api/), plugins (cron), utils (Playwright/Gemini/storage)
  nitro.config.ts       # #shared alias, srcDir:'server', cors routeRules, runtimeConfig.geminiApiKey
  scripts/postinstall.mjs   # playwright install chromium
  API.md                # generated API reference — regenerate เมื่อ route เปลี่ยน
apps/web/              # Nuxt 4 SPA frontend (port 3000)
  app/                 # pages, stores, components, composables, lib/api
  public/, wrangler.jsonc, scripts/build-pages.mjs
  nuxt.config.ts        # #shared alias, ssr:false, runtimeConfig.public.apiBase
packages/shared/        # plain TS, ไม่มี build step, import ผ่าน #shared alias — ไม่ใช่ npm package ที่ install
```

`#shared` alias ชี้ไปที่ `packages/shared` ทั้งสองฝั่ง (`apps/api/nitro.config.ts` + `apps/web/nuxt.config.ts`) — แก้ type/constant ที่เดียว ใช้ได้ทั้ง 2 app

**Deploy frontend ขึ้น Cloudflare Pages** (backend รันที่เครื่องตัวเอง หรือ tunnel):
- Build script: `pnpm --filter poc-pricetrends-web build:pages` (static preset, ไม่มี Playwright ใน dependency tree ของ apps/web เลย)
- Output: `apps/web/.output/public/`
- SPA fallback: `apps/web/public/_redirects`
- ตั้ง env บน Cloudflare Dashboard: `NUXT_PUBLIC_API_BASE=https://your-tunnel-url`
- Deploy CLI: `pnpm pages:deploy` (ต้อง `wrangler login` ก่อน)
- หรือเชื่อม Git → Build command: `pnpm --filter poc-pricetrends-web build:pages`, Output: `apps/web/.output/public`
- `CF_PAGES=1` ตอน build บน Cloudflare จะ set nitro preset เป็น `static` อัตโนมัติ

**Frontend API layer** — Pinia stores เรียก `~/lib/api/*` ไม่เรียก `fetch('/api/...')` โดยตรง ทุก request ผ่าน `apiBase` (`NUXT_PUBLIC_API_BASE`) เสมอ

**Logging system** (`apps/api/server/utils/logger.ts`):
- ทุก request append `LogEntry` ไปที่ `apps/api/output/logs/YYYYMMDD.jsonl`
- Fields: `timestamp`, `source`, `url`, `categoryId`, `searchQuery?`, `roundId?`, `durationMs`, `httpStatus`, `screenshotFile`, `error`, `errorType`, `geminiInputTokens?`, `geminiOutputTokens?`, `imageWidth?`, `imageHeight?`
- `screenshotFile` — join key ไปหา extracted items ใน `output/results/` (ผ่าน `/api/results/entries?screenshotFile=`)
- `errorType`: `timeout` | `screenshot` | `extraction` | `parse` | `config`
- UI ดู log ได้ที่ `/logs` — กรองตามวัน แสดง summary + error list + ดู extracted items ใน detail dialog (ดึงจาก results โดย `screenshotFile`)

**Frontend components/composables:**
- `apps/web/app/components/ScreenshotImg.vue` — แสดงภาพ screenshot พร้อม lightbox (thumbnail + full preview)
- `apps/web/app/components/SourceCheckResultTable.vue` — ตาราง pass/fail ต่อ source ใช้ร่วมกันทั้งส่วน "ผลล่าสุด" และ "ประวัติย้อนหลัง" ในหน้า `/sourcecheck`
- `apps/web/app/components/SourceConfigDialog.vue` — dialog ตั้งค่า screenshot config ต่อ source (ปุ่มเฟือง `mdi-tune` ต่อแถว) ใช้ `useSourceConfigStore`
- `apps/web/app/components/CategoryConfigDialog.vue` — dialog ตั้งค่า `maxSources`/`itemsPerSource` ต่อหมวด (ปุ่มเฟือง `mdi-cog-outline` หัว panel) ใช้ `useCategoryConfigStore`
- `apps/web/app/components/CronConfigDialog.vue` — dialog ตั้งค่า cron ต่อหมวด + ประวัติการรันล่าสุด (ปุ่มนาฬิกา `mdi-clock-outline` หัว panel) ใช้ `useCronConfigStore`
- `apps/web/app/components/SourceDetailDialog.vue` — dialog full-screen แสดงผลลัพธ์ + terminal log ต่อ source (เปิดจากการคลิกแถวใน `index.vue`)
  - `index.vue` เหลือแค่ orchestration state (dialog ไหนเปิดอยู่ target อะไร) — ลอจิกจริงของแต่ละ dialog อยู่ในไฟล์ข้างต้น อย่าย้าย logic กลับเข้า `index.vue`
- `apps/web/app/composables/useCategoryFields.ts` — ข้อมูล required/optional fields ต่อ category (Nuxt auto-import)
  - `getFieldOrder(categoryId)` — คืน canonical column order: required → price → currency → optional
  - ใช้ใน `index.vue` (srcHeaders, detailHeaders) และ `entries.vue` (getColumns) เพื่อให้ลำดับ column เหมือนกันทุก source ในหมวดเดียวกัน อย่า sort ด้วย `Object.keys()` ดิบ
- `apps/web/app/composables/useApi.ts` — API client wrapper อ่าน `NUXT_PUBLIC_API_BASE`
- `apps/web/app/lib/api/` — HTTP functions แยกตาม domain (results, logs, search, screenshots, sourcecheck, cron)

## Known gaps

- Screenshot route เปิด browser ใหม่ทุก request (~3–5s); no pooling yet.
- Cloudflare bot protection บางเว็บยังผ่านไม่ได้ (ได้หน้า "Verifying..." แทน) — ต้องใช้ stealth plugin เพิ่มเติม
