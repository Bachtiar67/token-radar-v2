# Token Radar v4

**Deterministic, offline-only token launch radar with 3-factor scoring, retail capital efficiency, and dark-mode dashboard.**

Built for the make.fun `token-radar-01` competition. Runs on Node 22+ standard library only — no network, no external dependencies at runtime, fully deterministic (identical SHA-256 output on repeated runs).

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Bachtiar67/token-radar-v2/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Bachtiar67/token-radar-v2/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

## Features

- **3-factor smart scoring**: Combines TVL, 7-day growth, protocol age, and simple risk penalty (derived purely from deterministic on-chain signals; zero hash-based proxies)
- **Retail capital efficiency**: Ranks protocols by net ROI per $1,000 deployed — gas, crowding, and opportunity cost included
- **4-stage TGE lifecycle**: Stealth (<60d) → Prime TGE Window (60-180d) → Maturing (180-365d) → Late-Stage (>365d)
- **Strict cohort separation**: Live tokens excluded from the pre-token board — zero leakage
- **Actionable 6-step farm plans**: Concrete USD capital, gas estimates, hold periods, governance votes, risk monitoring, and claim steps per protocol
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
# Copies dossier.json to /sdcard/Download/token-radar-v4-dossier.json
node src/cli.ts --input input/snapshot.json --output output --download

# Verify determinism (runs twice, compares SHA-256 of dossier.json)
node src/cli.ts --input input/snapshot.json --verify

# Generate screenshots only (requires existing output/data.js)
node src/cli.ts --screenshots-only
```

## Project Structure

```
token-radar-v4/
├── src/
│   ├── main.ts              # Entrypoint: reads snapshot, writes output
│   ├── cli.ts               # CLI wrapper with download & verify commands
│   └── generate-screenshots.ts  # Canvas-based PNG generator
├── lib/
│   └── model.ts             # 3-factor scoring model (deterministic)
├── dashboard/
│   ├── index.html           # Dark-mode dashboard page
│   ├── app.css              # Dark theme styles
│   └── app.js               # Dashboard logic (sort, filter, detail drawer)
├── vendor/
│   └── makefun-board.ts     # Dossier builder (from make.fun kit)
├── screenshots/             # Generated PNG screenshots (3 files, gitignored)
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
│                        TOKEN RADAR v4 PIPELINE                              │
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
                    │  │  • impliedValue()   │  │
                    │  │  • computeRiskFlags │  │
                    │  │  • percentileRank   │  │
                    │  │  • farmSteps()      │  │
                    │  └─────────────────────┘  │
                    │         radar-4.0         │
                    └─────────────┬─────────────┘
                                  │
              ┌───────────────────┼───────────────────┐
              ▼                   ▼                   ▼
    ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
    │ output/board.json│ │ output/data.js  │ │ output/screenshots/│
    │ (200 ranked rows)│ │ (window.RADAR)  │ │ (3 PNG 1440×900)│
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
                    /sdcard/Download/token-radar-v4-dossier.json
```

## Scoring Model (radar-4.0)

```
implied = round(
  tvl_usd × 0.25
  × (1 + clamp(change_7d, -60, 120) / 100 × 0.45)
  × (0.55 + min(age_days, 1095) / 1095 × 0.45)
  × (1 - risk_penalty)
)

composite_score = round((100 - cohort_percentile) × 100)
risk_tier = LOW (≥75) | MEDIUM (≥50) | HIGH (≥25) | CRITICAL (<25)
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
| **unknown_age_days** | 365 | Default for unlisted protocols |
| **risk_penalty_max** | 0.30 | Maximum risk penalty cap |

**Risk Flags & Penalties:**

| Flag | Condition | Penalty |
|------|-----------|---------|
| Very young protocol | age < 90 days | +8% |
| Young protocol | age < 180 days | +4% |
| Low TVL | TVL < $10M | +10% |
| Moderate TVL | TVL < $50M | +5% |
| Sharp TVL decline | growth < -30% | +8% |
| TVL declining | growth < -15% | +4% |
| Bridge protocol | category includes bridge | +6% |
| Centralized exchange | category includes CEX | +10% |
| Single-chain + low TVL | 1 chain, TVL < $100M | +3% |
| Testnet indicator | name includes test/alpha/beta | +5% |

**4-Stage TGE Lifecycle Classification:**

| Stage | Age Range | TGE Readiness | Strategy |
|-------|-----------|---------------|----------|
| **Stealth** | <60 days | 30% | Very early, high risk, monitor only |
| **Prime TGE Window** | 60-180 days | 90% | Optimal farming window |
| **Maturing** | 180-365 days | 60% | Still viable, diminishing returns |
| **Late-Stage** | >365 days | 20% | Low TGE probability, established |

**Pass Thresholds:**

| Tier | Composite | Risk | Action |
|------|-----------|------|--------|
| **STRONG BUY / LOW** | ≥75 | Low | Farm $150, 45d hold |
| **BUY / MEDIUM** | 50-74 | Medium | Farm $100, 60d hold |
| **WATCH / HIGH** | 25-49 | High | Small position $50, monitor |
| **AVOID / CRITICAL** | <25 | Critical | Avoid |

**Determinism:** All scores derived from snapshot fields via deterministic heuristics. No protocol name is special-cased. Identical SHA-256 on repeated runs.

## Output Files

| File | Description |
|------|-------------|
| `output/board.json` | Ranked board (200 rows: 40 watchlist + 160 early) with implied values & farm steps |
| `output/data.js` | `window.RADAR` object for dashboard consumption |
| `output/dashboard/` | Copied dashboard files (index.html, app.css, app.js) |
| `output/screenshots/` | 3 PNG screenshots (board, protocol detail, filtered view) |
| `output/dossier.json` | Dossier for make.fun judge (screenshots + source text) |

## Determinism Verification

```bash
$ npm run verify
--- DETERMINISM CHECK (two runs must match) ---
OK  dossier.json  sha1=24fc1426666d9c028ea419fd8c379e59ae3353fdb221d102ef7dc8fad81af809  sha2=24fc1426666d9c028ea419fd8c379e59ae3353fdb221d102ef7dc8fad81af809

--- SCREENSHOT BYTE SIZES (project screenshots/) ---
01-board.png: 206645 bytes
02-protocol-detail.png: 201024 bytes
03-filtered-view.png: 227674 bytes
Total screenshots bytes: 635343

--- DASHBOARD BYTE SIZES ---
index.html: 434 bytes
app.css: 11564 bytes
app.js: 19364 bytes
Total dashboard bytes: 31362 (< 54000 required)

ALL VERIFICATIONS PASSED
```

Identical SHA-256 on repeated runs confirms deterministic execution.

## Empirical Calibration (radar-4.0)

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