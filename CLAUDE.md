# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

PoC price-scraping pipeline for 5 Thai secondary-market categories (watches, amulets, IT products, branded goods, tools) across 27 sources. Single Nuxt 4 app — frontend (Vuetify 3) and backend (Nitro server routes) live in one project, no separate API server. There is no Python in this repo; an earlier Python version was fully rewritten to TypeScript by request.

## Commands

```bash
pnpm install    # also runs `playwright install chromium` via postinstall
pnpm dev        # http://localhost:3000 — UI + API on the same origin
pnpm build
pnpm preview
```

There is no test suite or lint script configured yet.

## Architecture

**Nuxt 4 source layout**: the app code lives directly under `app/` (Nuxt 4's default source dir), not under `src/` or project root — `app/pages`, `app/layouts`, `app/composables`. Backend code is under `server/` per Nitro convention (file-based routing in `server/api/`).

**Data flow for a scrape run:**
1. `app/pages/run.vue` POSTs to `server/api/run.post.ts`, which loads enabled sources from `server/lib/state.ts` (config persisted at `output/web_config.json`), then fires `server/lib/pipeline.ts#runPipeline` in the background and immediately returns a `runId`.
2. The frontend opens an `EventSource` against `server/api/run/[id]/stream.get.ts`, which polls the in-memory `activeRuns` map (in `server/lib/state.ts`) every 300ms and streams new log lines as SSE until the run reaches `done`/`error`.
3. `runPipeline` instantiates one scraper per enabled source via `server/scrapers/registry.ts` (maps the `scraperPath` string from `server/config.ts` to a scraper class), runs them with a custom concurrency-limited pool (`mapWithConcurrency`, limit 5) backed by one shared `NimbleClient` and one shared `PlaywrightClient` browser instance.
4. Results are saved to `output/prices_<timestamp>.json` and optionally pushed to `TARGET_API_URL` via `server/lib/push.ts`.
5. `app/pages/results/index.vue` and `[id].vue` read back through `server/api/results.get.ts` / `results/[id].get.ts`.

**Scraper pattern**: every scraper extends `server/scrapers/base.ts#BaseScraper`, implementing only `fetchItems()`. The base class provides `parse()` (cheerio), `cleanPrice()`, `absUrl()`, and wraps `fetchItems()` in `scrape()` for uniform error handling — a failed scraper produces a `ScrapedResult` with `success: false` rather than throwing into the pipeline. Two fetch strategies are used depending on the source:
- **Nimble** (`server/clients/nimble.ts`): default for most sites; `fetchHtml(url, { renderJs })` for JS-rendered pages, or `fetch(url)` directly against a Shopify `products.json` endpoint where available (faster/more reliable than scraping the storefront HTML — used by Radium Watch, Moppet, SF Brandname, Brandname Voyage, CompAsia).
- **Playwright** (`server/clients/playwrightClient.ts`): for login-required pages (Starbuyers, the 3 Facebook Tools groups) and heavy client-rendered SPAs (Shopee). The `tools/fbTools.ts` scraper is instantiated three times — once per Facebook group URL — from a single class; `sourceUrl`/`sourceName` are overridden per-instance in `runPipeline`.

**Config and credentials**: `server/config.ts` is the static source-of-truth list of all 27 sources (category IDs, default URL, scraper path). At runtime, the actually-used per-source config (enabled flag, editable URL) and all credentials (Nimble key, target API, FB login, Starbuyers login) live in `output/web_config.json` (file mode) or MySQL tables `source_configs` + `credentials` (DB mode), edited via the `/sources` and `/credentials` pages and read/written through `server/lib/state.ts`. `applyCredentials()` in `server/lib/pipeline.ts` copies saved credentials into `process.env` before each run so the clients (which read `process.env.*` directly) pick them up — there's no DI container, just env var mutation at run start.

**MySQL / production mode**: set `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE` env vars to switch storage from flat JSON files to MySQL. Run `server/db/schema.sql` once to create tables. When DB is active, scrape results are written to `scrape_results` + `price_items` tables, run logs to `run_logs`, and config/credentials to `source_configs`/`credentials`. File fallback (`output/*.json`) is used automatically when `MYSQL_HOST` is not set.

**Cron scheduler**: `server/lib/cron.ts` (node-cron) loads active schedules from the `cron_schedules` table at startup via `server/plugins/cron.ts`. Schedules are managed from the `/schedule` UI page (CRUD via `server/api/schedule*.ts`). Each cron job calls the same pipeline as a manual run. No-op when DB is not configured.

**Category IDs are shared across multiple sources**: e.g. IT products map to category IDs 107, 109, and 112 simultaneously; branded goods map to 108 and 110. See `CATEGORIES` and `SOURCES` in `server/config.ts` for the canonical mapping — don't assume a 1:1 category-to-ID relationship.

## Known gaps

- CSS selectors in each scraper are best-effort guesses against typical marketplace markup, not verified against live HTML — expect to need tuning per site after a real run.
- Run state (`activeRuns` in `server/lib/state.ts`) is in-memory only; restarting the dev/prod server loses in-flight run status. In DB mode completed runs persist to `scrape_runs`; in file mode completed JSON results in `output/` persist.
- `output/.env.example` documents env vars but the UI's Credentials page is the primary way values get set (persisted to `web_config.json`, not `.env`).
