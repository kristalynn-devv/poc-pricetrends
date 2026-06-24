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
- `GET /api/data?file=` — serve saved result JSON from `output/data/`
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

- **ใช้ helper กลางเสมอ** — ถ้า logic เดิมมีอยู่ใน `server/utils/` ให้ import มาใช้ อย่า copy หรือ reimplement ใหม่ในแต่ละ route:
  - stealth browser → `createStealthContext()` จาก `browserUtils.ts`
  - ปิด cookie popup → `dismissCookieBanner()` จาก `browserUtils.ts`
  - scroll lazy content → `scrollForLazyContent()` จาก `browserUtils.ts`
  - screenshot options/viewport → `mergeScreenshotConfig()` + `buildScreenshotOptions()` จาก `screenshotConfig.ts`
  - ถ่าย screenshot → `takeScreenshot()` จาก `browserUtils.ts`
  - สร้าง Gemini prompt → `buildExtractPrompt()` + `buildSchema()` จาก `extractPrompt.ts`
  - บันทึก result → `appendResult()` จาก `resultsStore.ts`
  - บันทึก log → `appendLog()` จาก `logger.ts`
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

**Data utilities:**
- `server/utils/sanitize.ts` — `sanitizeItems()`: coerce price เป็น integer, strip commas
- `server/utils/resultsStore.ts` — `appendResult()` / `readDailyResults()`: เขียน/อ่าน `output/results/YYYYMMDD.jsonl`

**File naming convention:** `[YYYYMMDD]_[CategoryID]_[SourceCode].jpg`
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

**Credentials**: `NUXT_GEMINI_API_KEY` ใน `.env` (ไม่ใช่ `GEMINI_API_KEY`) — Nuxt runtimeConfig map จาก prefix `NUXT_` เท่านั้น

**Logging system** (`server/utils/logger.ts`):
- ทุก request append `LogEntry` ไปที่ `output/logs/YYYYMMDD.jsonl`
- Fields: `timestamp`, `source`, `url`, `categoryId`, `searchQuery?`, `durationMs`, `httpStatus`, `screenshotFile`, `error`, `errorType`
- `errorType`: `timeout` | `screenshot` | `extraction` | `parse` | `config`
- UI ดู log ได้ที่ `/logs` (`app/pages/logs.vue`) — กรองตามวัน แสดง summary + error list

**Frontend components/composables ใหม่:**
- `app/components/ScreenshotImg.vue` — แสดงภาพ screenshot พร้อม lightbox (thumbnail + full preview)
- `app/composables/useCategoryFields.ts` — ข้อมูล required/optional fields ต่อ category (Nuxt auto-import)
  - `getFieldOrder(categoryId)` — คืน canonical column order: required → price → currency → optional
  - ใช้ใน `index.vue` (srcHeaders, detailHeaders) และ `entries.vue` (getColumns) เพื่อให้ลำดับ column เหมือนกันทุก source ในหมวดเดียวกัน อย่า sort ด้วย `Object.keys()` ดิบ

## Known gaps

- Screenshot route เปิด browser ใหม่ทุก request (~3–5s); no pooling yet.
- Cloudflare bot protection บางเว็บยังผ่านไม่ได้ (ได้หน้า "Verifying..." แทน) — ต้องใช้ stealth plugin เพิ่มเติม
