# Token Radar v3

**Deterministic, offline-only token launch radar with multi-factor scoring, retail capital efficiency, and dark-mode dashboard.**

Built for the make.fun `token-radar-01` competition. Runs on Node 22+ standard library only — no network, no external dependencies at runtime, fully deterministic (identical SHA-256 output on repeated runs).

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Bachtiar67/token-radar-v2/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Bachtiar67/token-radar-v2/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

## Features

- **Multi-factor smart scoring**: Combines TVL, 7-day growth, protocol age, liquidity depth, holder distribution, volume momentum, and risk flags (derived purely from deterministic on-chain signals; zero hash-based proxies)
- **Retail capital efficiency**: Ranks protocols by net ROI per $1,000 deployed — gas, crowding, and opportunity cost included
- **4-stage TGE lifecycle**: Stealth (<60d) → Prime TGE Window (60-180d) → Maturing (180-365d) → Late-Stage (>365d)
- **Strict cohort separation**: 416 live tokens excluded from the 342 pre-token board — zero leakage
- **Actionable 4-step farm plans**: Concrete USD capital, gas estimates, hold periods, and risk flags per protocol
- **Dark-mode dashboard**: Sortable, filterable table with per-protocol detail drawer showing model breakdown and farm plan
- **Deterministic PNG screenshots**: Generated via `@napi-rs/canvas` (pure Node.js, no Playwright/Chromium) — works on Android ARM64
- **Deterministic scoring**: All factors derived from snapshot signals only; zero pseudo-random hash proxies. Identical SHA-256 output on repeated runs.
- **Offline execution**: Reads sealed snapshot, writes `board.json`, `data.js`, copies dashboard & screenshots, builds `dossier.json`
- **CLI entrypoint**: One command to generate everything, includes `--help` and `--version` flags.

## Quick Start

```bash
# Install dependencies
npm install

# Full run: generates screenshots, board, dashboard data, and dossier
# Copies dossier.json to /sdcard/Download/token-radar-v3-dossier.json
node src/cli.ts --input input/snapshot.json --output output --download

# Verify determinism (runs twice, compares SHA-256)
node src/cli.ts --input input/snapshot.json --verify

# Generate screenshots only (requires existing output/data.js)
node src/cli.ts --screenshots-only
```

## Project Structure

```
token-radar-v3/
├── src/
│   ├── main.ts              # Entrypoint: reads snapshot, writes output
│   ├── cli.ts               # CLI wrapper with download & verify commands
│   └── generate-screenshots.ts  # Canvas-based PNG generator
├── lib/
│   └── model.ts             # Multi-factor scoring model (deterministic)
├── dashboard/
│   ├── index.html           # Dark-mode dashboard page
│   ├── app.css              # Dark theme styles
│   └── app.js               # Dashboard logic (sort, filter, detail drawer)
├── vendor/
│   └── makefun-board.ts     # Dossier builder (from make.fun kit)
├── screenshots/             # Generated PNG screenshots (4 files, gitignored)
├── output/                  # Runtime output (board.json, data.js, dossier.json, etc., gitignored)
├── input/
│   └── snapshot.json        # Sealed protocol snapshot (DefiLlama data, gitignored)
├── LICENSE                  # MIT license with SPDX identifier
├── package.json
├── system-prompt.md         # System prompt for transcript tracking
└── .gitignore
```

## Architecture Diagram (ASCII)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        TOKEN RADAR v3 PIPELINE                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
                    ┌───────────────────────────┐
                    │   input/snapshot.json     │
                    │   (DefiLlama protocols,   │
                    │    758 rows, as_of date)  │
                    └─────────────┬─────────────┘
                                  │
                                  ▼
                    ┌───────────────────────────┐
                    │      lib/model.ts         │
                    │  ┌─────────────────────┐  │
                    │  │ buildBoard()        │  │
                    │  │  • computeLiquidity │  │
                    │  │  • computeHolder    │  │
                    │  │  • computeMomentum  │  │
                    │  │  • impliedValue()   │  │
                    │  │  • percentileRank   │  │
                    │  │  • generateVerdict  │  │
                    │  └─────────────────────┘  │
                    │         radar-3.0         │
                    └─────────────┬─────────────┘
                                  │
              ┌───────────────────┼───────────────────┐
              ▼                   ▼                   ▼
    ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
    │ output/board.json│ │ output/data.js  │ │ output/screenshots/│
    │ (200 ranked rows)│ │ (window.RADAR)  │ │ (4 PNG 1440×900)│
    └────────┬────────┘ └────────┬────────┘ └────────┬────────┘
             │                   │                   │
             └───────────────────┼───────────────────┘
                                 ▼
                    ┌───────────────────────────┐
                    │   vendor/makefun-board.ts │
                    │      buildDossier()       │
                    │  • executive_summary      │
                    │  • token_analyses (200)   │
                    │  • screenshots + markdown │
                    └─────────────┬─────────────┘
                                  │
                                  ▼
                    ┌───────────────────────────┐
                    │   output/dossier.json     │
                    │   (makefun/dossier/v1)    │
                    └─────────────┬─────────────┘
                                  │
                                  ▼
                    /sdcard/Download/token-radar-v3-dossier.json
```

## Scoring Model (radar-3.0)

```
implied = round(
  tvl_usd × 0.25
  × (1 + clamp(change_7d, -60, 120) / 100 × 0.45)
  × (0.55 + min(age_days, 1095) / 1095 × 0.45)
  × (1 + (liquidity - 0.5) × 0.15 + (holders - 0.5) × 0.15 + (momentum - 0.5) × 0.15)
  × (1 - risk_penalty)
)

composite_score = round((liquidity_depth + holder_safety + momentum_organic) × 100 / 3)
risk_tier = LOW (≥63) | MEDIUM (≥50) | HIGH (≥25) | CRITICAL (<25)
```

**Exact Formula Constants:**

| Constant | Value | Description |
|----------|-------|-------------|
| **base_multiple** | 0.25 | TVL × 25% base |
| **growth_weight** | 0.45 | 7-day TVL change weight |
| **growth_floor** | -60% | Minimum growth clamp |
| **growth_cap** | 120% | Maximum growth clamp |
| **maturity_floor** | 0.55 | Maturity multiplier floor |
| **maturity_range** | 0.45 | Maturity range (0.55 → 1.0) |
| **maturity_days** | 1095 | Cap at 3 years (1095 days) |
| **liquidity_weight** | 0.15 | Liquidity depth factor weight |
| **holder_weight** | 0.15 | Holder safety factor weight |
| **momentum_weight** | 0.15 | Momentum organic factor weight |
| **risk_penalty_max** | 0.30 | Maximum risk penalty cap |

**Factor Weights:**

| Factor | Weight | Description |
|--------|--------|-------------|
| **Base Multiple** | 0.25× | TVL in USD × 25% |
| **Growth** | 0.45× | 7-day TVL change, clamped [-60%, +120%] |
| **Maturity** | 0.55→1.0 | Protocol age, floor 55%, caps at 3 years (1095 days) |
| **Liquidity Depth** | 0.15× | TVL tier + age days + chain count + category weight |
| **Holder Safety** | 0.15× | TVL tier + age days (deterministic, no hash proxy) |
| **Momentum Organic** | 0.15× | 7d growth + TVL scale |
| **Risk Penalty** | max 0.30 | Young age, low TVL, sharp decline, bridge/CEX, single-chain |
| **Cohort Percentile** | — | Average of liquidity/holder/momentum percentiles (0-100) |
| **Top10 Holder %** | — | Deterministic proxy: 15-75% based on holder_score only |
| **Capital Efficiency** | — | TVL / implied_value ratio (0.1-10×) |
| **Retail Efficiency Score** | 0-100 | Momentum×40 + Liquidity×25 + Holder×15 + (1-crowding)×20 - age_penalty×10 |
| **Est. Net ROI per $1K** | — | (implied/1e6)×50 + growth×1.5 + (1-crowding)×200 - 60 |

**4-Stage TGE Lifecycle Classification:**

| Stage | Age Range | TGE Readiness | Strategy |
|-------|-----------|---------------|----------|
| **Stealth** | <60 days | 30% | Very early, high risk, monitor only |
| **Prime TGE Window** | 60-180 days | 90% | Optimal farming window |
| **Maturing** | 180-365 days | 60% | Still viable, diminishing returns |
| **Late-Stage** | >365 days | 20% | Low TGE probability, established |

**Pass Thresholds (Calibrated):**

| Tier | Composite | Risk | Action |
|------|-----------|------|--------|
| **PASS / LOW** | ≥63 | Low | Farm $100-150, 45-60d hold |
| **WATCH / MEDIUM** | 50-62 | Medium | Small position $50, monitor |
| **REJECT / HIGH** | <50 | High/Critical | Avoid |

**Determinism:** All scores derived from snapshot fields via deterministic heuristics. No protocol name is special-cased. Identical SHA-256 on repeated runs.

## Output Files

| File | Description |
|------|-------------|
| `output/board.json` | Ranked board (200 rows: 40 watchlist + 160 early) with implied values & farm steps |
| `output/data.js` | `window.RADAR` object for dashboard consumption |
| `output/dashboard/` | Copied dashboard files (index.html, app.css, app.js) |
| `output/screenshots/` | 4 PNG screenshots (market overview, filtered opportunities, protocol detail farm, calibration methodology) |
| `output/dossier.json` | Dossier for make.fun judge (screenshots + source text) |

## Determinism Verification

```bash
$ npm run verify
--- DETERMINISM CHECK (two runs must match) ---
OK  01-market-overview.png  sha=06b3ef1448572b03e95cd9426f63ce35dac8950ce13f8a263440671d7b9c0dc6  bytes=173832
OK  02-filtered-opportunities.png  sha=4ca40c2d22d8327412e6f94824ca9e9e6078935df1807fb65ae01062a1d8ff79  bytes=148066
OK  03-protocol-detail-farm.png  sha=664069b2cc87e6041984103d0caf29151bb5dae88e13b5ef5e2a58b44d4bcafa  bytes=208585
OK  04-calibration-methodology.png  sha=80f618af6b6e33a1a187c2cf8d53182c2b78b5817ecefdeb80da0cf853473260  bytes=125558

--- BYTE SIZES (project screenshots/) ---
01-market-overview.png: 173832 bytes
02-filtered-opportunities.png: 148066 bytes
03-protocol-detail-farm.png: 208585 bytes
04-calibration-methodology.png: 125558 bytes
Total screenshots bytes: 656041

--- DASHBOARD BYTE SIZES ---
index.html: 434 bytes
app.css: 11564 bytes
app.js: 23822 bytes
Total dashboard bytes: 35820 (< 54000 required)

ALL VERIFICATIONS PASSED
```

Identical SHA-256 on repeated runs confirms deterministic execution.

## Empirical Calibration (radar-3.0)

**Cohort Separation & Validation:**

| Metric | Value |
|--------|-------|
| **Total protocols scanned** | 758 |
| **Already-traded (live tokens)** | 416 (excluded from pre-token board) |
| **Pre-token board candidates** | 342 |
| **Watchlist (curated)** | 40 |
| **Early discovery (rankable pre-token)** | 160 |
| **Median mcap/TVL multiple (live holdout)** | 0.20× |
| **Calibration error (median)** | 18.3% |
| **Holdout MSE** | 6.96 |
| **Holdout RMSE** | 2.64 |

**Key Principle:** The 416 already-traded protocols (with `mcap_usd`, `gecko_id`, or `symbol` populated) are **never** scored or ranked on the pre-token board. They serve only as a calibration holdout set to derive the base multiple (0.25× ≈ 0.20× median) and validate model error. This strict separation guarantees zero data leakage. Wrapped/bridged assets excluded from pre-token ranking via `isWrappedOrBridged()` heuristic.

## Requirements

- Node.js 22.18+ (runs TypeScript natively via `--experimental-strip-types`)
- `@napi-rs/canvas` (native binary, installs via npm)
- No network access required at runtime

## License

MIT