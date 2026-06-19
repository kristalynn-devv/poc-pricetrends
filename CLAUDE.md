# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

PoC price extraction tool — user points at a Thai secondary-market webpage, the app takes a silent Playwright screenshot, then sends it to Gemini 2.0 Flash to extract structured product data according to a per-category template.

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
2. `POST /api/screenshot` — Playwright headless opens the URL, returns a base64 JPEG
3. `POST /api/extract` — sends base64 image to Gemini 2.0 Flash with a category-specific schema prompt; returns JSON array of extracted product items

**Server routes:**
- `server/api/screenshot.post.ts` — Playwright headless screenshot → `{ base64, mimeType }`
- `server/api/extract.post.ts` — Gemini vision extraction → `{ items[] }` per CATEGORY_FIELDS schema

**Category field templates** (defined in `extract.post.ts`):
- 103 นาฬิกา: brand, model, price, condition, dialColor, caseMaterial, strapMaterial, movementType
- 106 พระ/วัตถุมงคล: title, model, price, material, moldType, year, weight
- 107/109/112 IT/โน้ตบุ๊ก/มือถือ: itemType, brand, model, price, capacity, condition
- 108/110 แบรนเนม/แว่นตา: itemType, brand, model, price, year, condition
- 111 เครื่องมือช่าง: itemType, brand, model, price, condition

User can also define a fully custom template in the UI (field name + description pairs).

**Credentials**: `GEMINI_API_KEY` in `.env` (never committed). Read via `useRuntimeConfig()` in server routes (`runtimeConfig.geminiApiKey` in `nuxt.config.ts`).

## Known gaps

- Screenshot route opens a fresh Playwright browser per request (slow ~3–5s); no pooling yet.
- No result persistence — extracted data lives only in the browser until downloaded as JSON.
- Gemini may fail to parse tightly packed listing pages; prompt tuning per site may be needed.
