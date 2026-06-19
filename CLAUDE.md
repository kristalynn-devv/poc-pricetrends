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
- `server/api/chrono24-search.post.ts` — Chrono24 batch search: scrapes listing page → ถ่ายแต่ละรายการ + Gemini extract
- `server/api/screenshot.post.ts` — standalone screenshot → `{ base64, mimeType, filename }`
- `server/api/extract.post.ts` — standalone Gemini extraction → `{ items[] }`
- `GET /api/logs/entries?date=YYYYMMDD` — raw JSONL log entries for a given day
- `GET /api/logs/summary?date=YYYYMMDD` — daily summary (total/success/failed, bySource, byCategory, avgDuration)

**Screenshot config:**
- Viewport: 1920×1080
- Anti-bot: `--disable-blink-features=AutomationControlled` + real user-agent + `navigator.webdriver = undefined`
- Cookie popup: auto-dismiss (`Accept all`, `Agree`, `OK` ใน dialog)
- `waitUntil: 'load'` + 3s wait (ไม่ใช้ `networkidle` — timeout บนเว็บที่มี background requests)
- Mouse move to (0,0) ก่อนถ่ายเพื่อหลีก hover zoom effect

**File naming convention:** `[YYYYMMDD]_[CategoryID]_[SourceCode].jpg`
- บันทึกที่ `output/screenshots/`
- Source codes: `CHR`=chrono24, `SHP`=shopee, `LAZ`=lazada, `KAI`=kaidee, `FBK`=facebook, `MRC`=mercari, `EBY`=ebay, `YAH`=yahoo — domain อื่นใช้ 3 ตัวแรกของ domain อัตโนมัติ

**Gemini model:** `gemini-3.1-flash-lite`

**Category field templates** (defined in `analyze.post.ts` และ `extract.post.ts`):
- 103 นาฬิกา: brand, model, price, currency, condition, dialColor, caseMaterial, strapMaterial, movementType
- 106 พระ/วัตถุมงคล: title, model, price, currency, material, moldType, year, weight
- 107/109/112 IT/โน้ตบุ๊ก/มือถือ: itemType, brand, model, price, currency, capacity, condition
- 108/110 แบรนเนม/แว่นตา: itemType, brand, model, price, currency, year, condition
- 111 เครื่องมือช่าง: itemType, brand, model, price, currency, condition

`price` = ตัวเลขเท่านั้น, `currency` = สกุลเงิน (THB/USD/JPY/EUR) แยกกัน

**Credentials**: `NUXT_GEMINI_API_KEY` ใน `.env` (ไม่ใช่ `GEMINI_API_KEY`) — Nuxt runtimeConfig map จาก prefix `NUXT_` เท่านั้น

**Logging system** (`server/utils/logger.ts`):
- ทุก request (analyze + chrono24-search) append `LogEntry` ไปที่ `output/logs/YYYYMMDD.jsonl`
- Fields: `timestamp`, `source`, `url`, `categoryId`, `searchQuery?`, `durationMs`, `httpStatus`, `screenshotFile`, `itemsExtracted`, `error`, `errorType`
- `errorType`: `timeout` | `screenshot` | `extraction` | `parse` | `config`
- UI ดู log ได้ที่ `/logs` (`app/pages/logs.vue`) — กรองตามวัน แสดง summary + error list

## Known gaps

- Screenshot route เปิด browser ใหม่ทุก request (~3–5s); no pooling yet.
- Cloudflare bot protection บางเว็บยังผ่านไม่ได้ (ได้หน้า "Verifying..." แทน) — ต้องใช้ stealth plugin เพิ่มเติม
- No result persistence — extracted data lives only in the browser until downloaded as JSON.
