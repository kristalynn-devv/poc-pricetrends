# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

PoC price extraction tool — user points at a Thai secondary-market webpage, the app takes a silent Playwright screenshot, then sends it to Gemini to extract structured product data according to a per-category template.

Single Nuxt 4 app: frontend (Vuetify 3) + backend (Nitro server routes) in one project. No Python.

## Commands

```bash
pnpm install    # also runs `playwright install chromium` via postinstall
pnpm dev        # http://localhost:3000
pnpm build
pnpm preview
```

## Architecture

**Nuxt 4 source layout**: app code under `app/` (pages, layouts, composables). Backend under `server/api/` (Nitro file-based routing).

**Workflow:**
1. User enters a URL + selects category (or uploads an image manually)
2. กด "ถ่ายรูป" → `POST /api/analyze` — Playwright ถ่าย + Gemini extract ในครั้งเดียว บันทึกภาพอัตโนมัติ
3. ผลลัพธ์แสดงใน UI ทันที (ไม่ต้องกดปุ่มแยก)

**Server routes:**
- `server/api/analyze.post.ts` — **main endpoint**: screenshot + extract + save ในครั้งเดียว → `{ filename, base64, mimeType, items[] }`
- `server/api/screenshot.post.ts` — standalone screenshot → `{ base64, mimeType, filename }`
- `server/api/extract.post.ts` — standalone Gemini extraction → `{ items[] }`
- `GET /api/screenshot?file=` — serve screenshot image from `output/screenshots/`
- `GET /api/results/entries?date=YYYYMMDD` — daily extracted results (`output/results/`)
- `GET /api/results/entries?date=YYYYMMDD&screenshotFile=` — single result by screenshot filename
- `GET /api/logs/entries?date=YYYYMMDD` — raw JSONL log entries for a given day
- `GET /api/logs/summary?date=YYYYMMDD` — daily summary (total/success/failed, bySource, byCategory, avgDuration)

**Batch-search routes** — รับ `{ query, categoryId, limit, screenshotConfig? }` แล้ว scrape listing page → ถ่ายแต่ละ item + Gemini extract → `{ results[], logs[] }`

Route files ทั้งหมด 17 ไฟล์อยู่ที่ `server/api/*-search.post.ts` ทุก route ผูก `apiRoute` ใน `index.vue` แล้วทั้งหมด:

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

Source list ทั้งหมดนิยามใน `index.vue` (`categoryGroups`) — เป็น single source of truth

**เพิ่ม source ใหม่ต้องทำพร้อมกัน 2 ที่**: route file + `index.vue`

## Rules

- **อัปเดต CLAUDE.md ทุกครั้งที่มีการเปลี่ยนแปลง** — เมื่อเพิ่ม route, utility, component, หรือเปลี่ยน architecture ให้อัปเดต CLAUDE.md ให้ตรงกับ code จริงเสมอ

- **ใช้ helper กลางเสมอ** — ถ้า logic เดิมมีอยู่ใน `server/utils/` ให้ import มาใช้ อย่า copy หรือ reimplement ใหม่ในแต่ละ route:
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
- **ถ้า logic ซ้ำกัน 2+ route ให้ย้ายไป `server/utils/`** ก่อนแล้วค่อย import
- **field definitions** มี 2 ที่ ใช้ให้ถูก:
  - **server** → `CATEGORY_FIELDS` + `buildSchema()` จาก `extractPrompt.ts` (สำหรับสร้าง Gemini prompt)
  - **frontend** → `useCategoryFields.ts` composable (สำหรับ UI required/optional fields)
  - อย่านิยาม field list ซ้ำในที่อื่น

**Screenshot config** (`server/utils/screenshotConfig.ts`):
- ค่า default: viewport 1920×1080, fullPage=true, quality=90
- ปรับได้จาก UI (ปุ่ม ⚙ หน้าหลัก) — ส่งมาใน request body เป็น `screenshotConfig` object
- fields: `viewportWidth`, `viewportHeight`, `fullPage`, `quality`, `clip` (x/y/width/height/enabled)
- Anti-bot: `--disable-blink-features=AutomationControlled` + real user-agent + `navigator.webdriver = undefined`
- Cookie popup: auto-dismiss (`Accept all`, `Agree`, `OK` ใน dialog)
- `waitUntil: 'load'` + 3s wait (ไม่ใช้ `networkidle` — timeout บนเว็บที่มี background requests)

**Filename utilities** (`server/utils/filename.ts`):
- `fileTimestampPrefix()` — `YYYYMMDD_HHmmss` (UTC)
- `buildScreenshotFilename(...parts)` — `YYYYMMDD_HHmmss_{parts}.jpg`
- `buildUrlScreenshotFilename(url, categoryId?)` — สำหรับ analyze/screenshot route
- `sourceCode(url)` — map domain → 3-letter source code

**Browser utilities** (`server/utils/browserUtils.ts`):
- `createStealthContext()` — สร้าง BrowserContext พร้อม stealth + viewport จาก screenshotConfig (รองรับ locale th-TH/en-US)
- `dismissCookieBanner()` — ปิด popup อัตโนมัติ (shared selectors ทุก route ใช้ร่วมกัน)
- `scrollForLazyContent()` — scroll ลงแล้วกลับขึ้น เพื่อ trigger lazy-load
- `takeScreenshot()` — ถ่าย screenshot ด้วย options จาก screenshotConfig

**Prompt utilities** (`server/utils/extractPrompt.ts`):
- `buildExtractPrompt()` — สร้าง Gemini prompt ตาม category + mode (listing/detail)
- `buildSchema()` — สร้าง JSON schema description จาก categoryId หรือ template ที่กำหนดเอง
- `CATEGORY_FIELDS` — field list ต่อ category (export ใช้ใน route ได้)
- `getCategoryLabel()` — ชื่อหมวดหมู่ภาษาไทยต่อ categoryId

**Data storage** (ไม่ซ้ำซ้อน — แต่ละโฟลเดอร์มีหน้าที่เดียว):
- `output/screenshots/` — รูป JPG
- `output/results/YYYYMMDD.jsonl` — **แหล่งเดียว** ของข้อมูลสินค้าที่ extract ได้ (1 entry ต่อ screenshot)
- `output/logs/YYYYMMDD.jsonl` — operational log (duration, error, tokens, `screenshotFile` pointer)

**Data utilities:**
- `server/utils/sanitize.ts` — `sanitizeItems()`: coerce price เป็น integer, strip commas
- `server/utils/persistExtraction.ts` — `persistExtraction()`: บันทึก `appendResult` + `appendLog` success ในครั้งเดียว
- `server/utils/resultsStore.ts` — `appendResult()` / `readDailyResults()`: เขียน/อ่าน `output/results/YYYYMMDD.jsonl`
  - `ResultEntry` มี `roundId?` (batch run ID) และ `searchQuery?` สำหรับ group ผลลัพธ์

**File naming convention:** `[YYYYMMDD]_[HHmmss]_[CategoryID]_[SourceCode][_{suffix}].jpg`
- บันทึกที่ `output/screenshots/`
- Source codes: `CHR`=chrono24, `SHP`=shopee, `LAZ`=lazada, `KAI`=kaidee, `FBK`=facebook, `MRC`=mercari, `EBY`=ebay, `YAH`=yahoo — domain อื่นใช้ 3 ตัวแรกของ domain อัตโนมัติ

**Result persistence:** batch-search routes ที่สำเร็จ save JSON ไปที่ `output/results/YYYYMMDD.jsonl` (1 entry ต่อ item) — ดูได้ที่ `/entries` (`app/pages/entries.vue`)

**Gemini model:** `gemini-3.1-flash-lite`

**Category field templates** (นิยามใน `app/composables/useCategoryFields.ts` — auto-import ใน index.vue):
- 103 นาฬิกา: brand, model (required) + optional: dialColor, caseMaterial, strapMaterial, movementType, condition
- 106 พระ/วัตถุมงคล: title, material (required) + optional: model, moldType, year, weight
- 107/109/112 IT: brand, model (required) + optional: itemType, capacity, condition
- 108/110 แบรนเนม: brand, model (required) + optional: itemType, year, condition
- 111 เครื่องมือช่าง: brand, model (required) + optional: itemType, condition
- price + currency เป็น common optional fields ของทุกหมวด

UI ให้ผู้ใช้เพิ่ม optional fields ได้ด้วย chip — ใส่ค่าแล้ว combine เป็น query string ส่งให้ route

`price` = ตัวเลขเท่านั้น, `currency` = สกุลเงิน (THB/USD/JPY/EUR) แยกกัน

**Credentials & split config:**
- `NUXT_GEMINI_API_KEY` ใน `.env` (server-only) — Gemini API key
- `NUXT_PUBLIC_API_BASE` ใน `.env` (optional) — backend URL เมื่อแยก frontend; ว่าง = same-origin `/api`
- ดู `.env.example` สำหรับ template

**Split-ready architecture** (แยก backend/frontend ในอนาคต):

```
shared/              # API contract — types, paths, constants (import ได้ทั้ง app + server)
  types/             # LogEntry, ResultEntry, ItemResult, StreamEvent, ScreenshotConfig
  constants/         # CATEGORY_NAMES, SEARCH_ROUTES, SEARCH_ROUTE_CATEGORY
  api/paths.ts       # API_PATHS, screenshotPath(), withQuery()
app/lib/api/         # HTTP client — ทุก fetch ผ่านที่นี่ ไม่ hardcode /api ใน store/page
  client.ts          # apiUrl(), apiFetch(), apiJson() + apiBase param
  results.ts, logs.ts, screenshots.ts, search.ts
app/composables/useApi.ts  # อ่าน NUXT_PUBLIC_API_BASE จาก runtimeConfig
server/              # Nitro backend — import types จาก #shared, ไม่ import จาก app/
```

เมื่อแยกจริง:
1. ย้าย `shared/` → `packages/shared` (pnpm workspace)
2. ย้าย `server/` → `apps/api` (Nitro standalone)
3. ย้าย `app/` → `apps/web` (Nuxt SPA)
4. ตั้ง `NUXT_PUBLIC_API_BASE` ชี้ไป backend tunnel
5. Backend เปิด CORS แล้ว (nitro `routeRules: { '/api/**': { cors: true } }`)

**Deploy frontend ขึ้น Cloudflare Pages** (backend รันที่เครื่องตัวเอง):
- Build script: `pnpm build:pages` (static preset, ไม่ติดตั้ง Playwright)
- Output: `.output/public/`
- SPA fallback: `public/_redirects`
- ตั้ง env บน Cloudflare Dashboard: `NUXT_PUBLIC_API_BASE=https://your-tunnel-url`
- Deploy CLI: `pnpm pages:deploy` (ต้อง `wrangler login` ก่อน)
- หรือเชื่อม Git → Build command: `pnpm build:pages`, Output: `.output/public`
- `CF_PAGES=1` ตอน build บน Cloudflare จะ skip Playwright อัตโนมัติ

**Frontend API layer** — Pinia stores เรียก `~/lib/api/*` ไม่เรียก `fetch('/api/...')` โดยตรง

**Logging system** (`server/utils/logger.ts`):
- ทุก request append `LogEntry` ไปที่ `output/logs/YYYYMMDD.jsonl`
- Fields: `timestamp`, `source`, `url`, `categoryId`, `searchQuery?`, `roundId?`, `durationMs`, `httpStatus`, `screenshotFile`, `error`, `errorType`, `geminiInputTokens?`, `geminiOutputTokens?`, `imageWidth?`, `imageHeight?`
- `screenshotFile` — join key ไปหา extracted items ใน `output/results/` (ผ่าน `/api/results/entries?screenshotFile=`)
- `errorType`: `timeout` | `screenshot` | `extraction` | `parse` | `config`
- UI ดู log ได้ที่ `/logs` — กรองตามวัน แสดง summary + error list + ดู extracted items ใน detail dialog (ดึงจาก results โดย `screenshotFile`)

**Frontend components/composables:**
- `app/components/ScreenshotImg.vue` — แสดงภาพ screenshot พร้อม lightbox (thumbnail + full preview)
- `app/composables/useCategoryFields.ts` — ข้อมูล required/optional fields ต่อ category (Nuxt auto-import)
  - `getFieldOrder(categoryId)` — คืน canonical column order: required → price → currency → optional
  - ใช้ใน `index.vue` (srcHeaders, detailHeaders) และ `entries.vue` (getColumns) เพื่อให้ลำดับ column เหมือนกันทุก source ในหมวดเดียวกัน อย่า sort ด้วย `Object.keys()` ดิบ
- `app/composables/useApi.ts` — API client wrapper อ่าน `NUXT_PUBLIC_API_BASE`
- `app/lib/api/` — HTTP functions แยกตาม domain (results, logs, search, screenshots)

## Known gaps

- Screenshot route เปิด browser ใหม่ทุก request (~3–5s); no pooling yet.
- Cloudflare bot protection บางเว็บยังผ่านไม่ได้ (ได้หน้า "Verifying..." แทน) — ต้องใช้ stealth plugin เพิ่มเติม
