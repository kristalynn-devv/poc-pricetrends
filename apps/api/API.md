# poc-pricetrends API

Standalone Nitro backend. Default dev/preview port: **8080** (`PORT` env var, see `.env`).
All routes are prefixed `/api` and have CORS enabled for `*` (see `nitro.config.ts`).

Regenerate this file whenever a route is added/changed under `server/api/`.

## Swagger / OpenAPI

Nitro's built-in OpenAPI generator is enabled (`experimental.openAPI` + `openAPI` in `nitro.config.ts`, `production: 'runtime'` so it also works on `pnpm preview`, not just `pnpm dev`). No extra dependency — served directly by Nitro:

- `GET /docs` — Swagger UI (route renamed from Nitro's default `/_swagger` via `openAPI.ui.swagger.route`)
- `GET /reference` — Scalar UI (alternative renderer, renamed from default `/_scalar` via `openAPI.ui.scalar.route`)
- `GET /openapi.json` — raw OpenAPI 3.1 document (renamed from default `/_openapi.json` via `openAPI.route`)

These paths follow the common REST-API doc convention (`/docs`, `/openapi.json`) instead of Nitro's underscore-prefixed defaults, so they're discoverable without reading this file first.

Each route's schema comes from a `defineRouteMeta({ openAPI: {...} })` call at the top of its file (auto-imported global, no import needed). **Must be a literal object** — Nitro's build-time extractor only walks static `ObjectExpression`/`ArrayExpression`/`Literal` AST nodes, so referencing an imported helper function (e.g. `defineRouteMeta({ openAPI: sharedFn(...) })`) silently produces empty metadata. Batch-search routes therefore each have their own inlined literal (same shape, cannot share via a function).

`tags` group routes in the Swagger/Scalar UI sidebar: `Analyze` (`/api/analyze`, `/api/extract`), `Screenshot` (`/api/screenshot*`), `Cron` (`/api/cron-*`), `Logs` (`/api/logs/*`), `Results` (`/api/results/*`), `Source Check` (`/api/sourcecheck*`), `Batch Search` (the 17 `*-search.post.ts` routes).

## Core routes

### `POST /api/analyze`
Screenshot + Gemini extract + save, in one call. Main endpoint used by the UI's "ถ่ายรูป" button.

Request body:
```ts
{
  url: string                              // required
  categoryId?: string                      // '103' | '106' | '107' | ... — selects the field schema
  template?: Record<string, string>        // custom field schema, overrides categoryId defaults
  config?: Partial<ScreenshotConfig>       // viewport/quality/clip overrides
}
```

Response `200`:
```ts
{
  filename: string        // saved screenshot filename, e.g. 20260701_163119_103_CHR_....jpg
  base64: string           // JPEG, base64-encoded
  mimeType: 'image/jpeg'
  items: Record<string, unknown>[]   // extracted items (empty array if Gemini output wasn't valid JSON)
  raw?: string              // present only when JSON parsing failed — the raw Gemini text
}
```

Errors: `{ statusCode, data: { errorType, message } }` — see [Error shape](#error-shape). Common cases: `400 config` (missing url), `500 config` (Gemini key not configured), `504 timeout`/`screenshot` (page load failed), `502 extraction` (Gemini call failed).

Side effects: writes `output/screenshots/<filename>.jpg`, appends `output/results/YYYYMMDD.jsonl` (success) and/or `output/logs/YYYYMMDD.jsonl` (always, on both success and failure).

---

### `POST /api/screenshot`
Standalone screenshot only, no Gemini extraction, no persistence to `results/`.

Request body: `{ url: string; categoryId?: string; config?: ScreenshotConfig }`

Response `200`: `{ filename: string; mimeType: 'image/jpeg' }` — image bytes are written to `output/screenshots/`, not returned inline.

---

### `POST /api/extract`
Standalone Gemini extraction from an already-captured base64 image — no Playwright, no persistence.

Request body: `{ base64: string; mimeType: string; categoryId?: string; template?: Record<string, string> }`

Response `200`: `{ items: Record<string, unknown>[] }` or `{ items: []; raw: string }` if Gemini's output wasn't valid JSON.

---

### `GET /api/screenshot?file=<filename>`
### `GET /api/screenshots/<filename>`
Two equivalent routes that serve a saved screenshot from `output/screenshots/`. Response is the raw JPEG (`Content-Type: image/jpeg`, cached 24h). `404` if not found.

---

### `GET /api/results/entries?date=YYYYMMDD[&screenshotFile=]`
Reads `output/results/YYYYMMDD.jsonl` (defaults to today, UTC).

- Without `screenshotFile`: `{ date: string; entries: ResultEntry[] }`
- With `screenshotFile`: `{ date: string; entry: ResultEntry | null }` — single entry lookup by screenshot filename (join key from logs).

`ResultEntry` fields: `timestamp, source, url, categoryId, screenshotFile, items[], durationMs, searchQuery?, roundId?, geminiInputTokens?, geminiOutputTokens?, imageWidth?, imageHeight?`.

---

### `GET /api/logs/entries?date=YYYYMMDD`
Raw JSONL log lines for a day (`output/logs/YYYYMMDD.jsonl`, defaults to today). Response: `{ date: string; entries: LogEntry[] }` (empty array if the file doesn't exist yet).

`LogEntry` fields: `timestamp, source, url, categoryId, searchQuery?, roundId?, durationMs, httpStatus, screenshotFile, error, errorType, geminiInputTokens?, geminiOutputTokens?, imageWidth?, imageHeight?`. `errorType` is one of `timeout | screenshot | extraction | parse | config`.

---

### `GET /api/logs/summary?date=YYYYMMDD`
Aggregated daily stats derived from the log file. Response: `{ date, total, success, failed, bySource: Record<string, number>, byCategory: Record<string, number>, avgDuration: number }`.

---

### `POST /api/sourcecheck`
Runs a real source-check query against every search route (or one, if `{ source }` is given), using a fixed sample query per category (`SOURCECHECK_QUERIES` in `server/utils/sourcecheck.ts`, `limit: 1`), and checks pass/fail (product found + screenshot captured). Appends the result to `output/sourcecheck/YYYYMMDD.jsonl`.

Request body: `{ source?: SearchRouteKey }` — omit to run all 17 sources (run sequentially, concurrency 1 — running them in parallel overloads Playwright/Chromium on typical dev machines).

Response `200` (`SourceCheckRun`):
```ts
{
  runId: string          // ISO timestamp, used as the run identifier
  timestamp: string
  results: {
    source: SearchRouteKey
    categoryId: string
    query: string
    pass: boolean
    productsFound: number
    screenshotOk: number
    extractOk: number
    durationMs: number
    error: string | null
    timestamp: string
  }[]
}
```

### `GET /api/sourcecheck`
Reads the most recent source-check run from `output/sourcecheck/`. Response: `SourceCheckRun | null`.

---

### `GET /api/cron-config`
Cron config for every category group, merged with defaults for any group that hasn't been configured yet. Response: `CronConfigMap` — `Record<categoryLabel, CronCategoryConfig>` where:
```ts
CronCategoryConfig = {
  enabled: boolean
  cronExpression: string   // 5-field cron, e.g. '0 8 * * *'
  queries: string[]
  maxSources: number
  itemsPerSource: number
}
```

### `POST /api/cron-config`
Saves cron config for one category and reschedules it immediately (no server restart needed).

Request body: `{ label: string; config: CronCategoryConfig }` — `label` must match one of the labels in `packages/shared/constants/categoryGroups.ts` (`CATEGORY_GROUPS`).

Response `200`: the saved `CronCategoryConfig`. `400` if `label` is invalid or `cronExpression` fails validation while `enabled: true`.

### `GET /api/cron-runs`
Last 30 cron run log entries across all categories, most recent first. Response: `CronRunLogEntry[]`:
```ts
{ runId: string; label: string; timestamp: string; queries: string[]; sourceCount: number; durationMs: number; error?: string }
```

---

### `GET /api/source-config`
Per-source screenshot/limit config overrides, persisted server-side at `output/source-config.json` (survives moving machines/browsers — no longer browser `localStorage`). Only sources with a saved override are present; missing sources fall back to client-side defaults. Response: `SourceConfigMap` — `Record<sourceName, SourceCfg>` where:
```ts
SourceCfg = {
  viewportWidth: number
  viewportHeight: number
  quality: number
  cropHeight?: number
  clip: { enabled: boolean; x: number; y: number; width: number; height: number }
  limit: number
}
```

### `POST /api/source-config`
Saves config for one source. Request body: `{ name: string; config: Partial<SourceCfg> }`. Response `200`: the saved `SourceCfg`. `400` if `name` is missing.

### `DELETE /api/source-config`
Resets one source back to defaults (deletes its override). Request body: `{ name: string }`. Response `200`: `{ ok: true }`. `400` if `name` is missing.

### `POST /api/source-config/migrate`
One-time import of config previously kept in browser `localStorage` (called automatically by the frontend on first load after this endpoint shipped). Request body: `SourceConfigMap`. Only fills in sources not already present server-side — never overwrites an existing server-side override. Response: the merged `SourceConfigMap`.

---

## Batch-search routes

17 routes, one per source, all sharing the same request/response contract. Each scrapes a listing page for the given query, then screenshots + Gemini-extracts each matching item, streaming progress as **newline-delimited JSON (NDJSON)**, `Content-Type: application/x-ndjson`. Each successfully extracted item is persisted immediately (`output/results/` + `output/logs/`) — the client does not need to wait for the stream to finish for data to be saved.

| Route | Site | หมวด (categoryId) |
|---|---|---|
| `POST /api/chrono24-search` | chrono24.com | 103 |
| `POST /api/auctionhouse-search` | auctionhouse.co.th | 103/106/107/108/109/110/111/112 |
| `POST /api/radiumwatch-search` | radiumwatch.com | 103 |
| `POST /api/siamwatchclub-search` | siamwatchclub.com | 103 |
| `POST /api/komehyo-search` | komehyo.co.th | 103/108/110 |
| `POST /api/thaprachan-search` | thaprachan.com | 106 |
| `POST /api/wutdychonburi-search` | wutdychonburi.com | 106 |
| `POST /api/prapantip-search` | prapantip.com | 106 |
| `POST /api/uauction-search` | uauction.uamulet.com | 106 |
| `POST /api/shopbkk-search` | shopbkk.com | 107/109/112 |
| `POST /api/compasia-search` | compasia.co.th | 107/109/112 |
| `POST /api/kaidee-search` | kaidee.com | 107/109/111/112 |
| `POST /api/sasom-search` | sasom.co.th | 108/110 |
| `POST /api/moppet-search` | moppetbrandname.com | 108/110 |
| `POST /api/sfbrandname-search` | sfbrandname.com | 108/110 |
| `POST /api/brandnamevoyage-search` | brandnamevoyage.com | 108/110 |
| `POST /api/truck2hand-search` | truck2hand.com | 111 |

Request body:
```ts
{
  query: string                            // required — search keywords
  categoryId?: string                      // defaults to the route's primary category
  template?: Record<string, string>        // custom field schema, overrides categoryId defaults
  limit?: number                            // max listing items to process (default varies per route)
  screenshotConfig?: ScreenshotConfig
  roundId?: string                          // groups multiple queries/sources under one batch run (used by UI + cron)
}
```

Response: a stream of NDJSON lines, each one of:
```ts
{ type: 'log'; ts: string; level: 'info' | 'warn' | 'error'; msg: string; data?: unknown }
{ type: 'result'; index: number; url: string; filename: string | null; screenshotOk: boolean; extractOk: boolean; items: Record<string, unknown>[]; error?: string }
{ type: 'searchpage'; base64: string }   // emitted only when the listing page itself looks bot-blocked
{ type: 'done'; query: string; summary: { total: number; screenshotOk: number; extractOk: number }; error?: string }
```

---

## Error shape

Non-2xx responses (via `apiError()` in `server/utils/errors.ts`) return:
```ts
{
  statusCode: number
  data: {
    errorType: 'timeout' | 'screenshot' | 'extraction' | 'parse' | 'config'
    message: string
  }
}
```
The frontend's `ApiClientError` (`apps/web/app/lib/api/client.ts`) parses this shape automatically.
