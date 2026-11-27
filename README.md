# Token Radar v2

**Deterministic, offline-only token launch radar with multi-factor scoring and dark-mode dashboard.**

Built for the make.fun `token-radar-01` competition. Runs on Node 22+ standard library only — no network, no external dependencies at runtime, fully deterministic (identical SHA-256 output on repeated runs).

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Bachtiar67/token-radar-v2/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Bachtiar67/token-radar-v2/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

## Features

- **Multi-factor smart scoring**: Combines TVL, 7-day growth, protocol age, liquidity depth, holder distribution, volume momentum, and risk flags
- **Dark-mode dashboard**: Sortable, filterable table with per-protocol detail drawer showing model breakdown and farm plan
- **Deterministic PNG screenshots**: Generated via `@napi-rs/canvas` (pure Node.js, no Playwright/Chromium) — works on Android ARM64
- **Offline execution**: Reads sealed snapshot, writes `board.json`, `data.js`, copies dashboard & screenshots, builds `dossier.json`
- **CLI entrypoint**: One command to generate everything and copy `dossier.json` to `/sdcard/Download/token-radar-v2-dossier.json`

## Quick Start

```bash
# Install dependencies
npm install

# Full run: generates screenshots, board, dashboard data, and dossier
# Copies dossier.json to /sdcard/Download/token-radar-v2-dossier.json
node src/cli.ts --input input/snapshot.json --output output --download

# Verify determinism (runs twice, compares SHA-256)
node src/cli.ts --input input/snapshot.json --verify

# Generate screenshots only (requires existing output/data.js)
node src/cli.ts --screenshots-only
```

## Project Structure

```
token-radar-v2/
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
│                        TOKEN RADAR v2 PIPELINE                              │
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
                    │         radar-2.1         │
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
                    /sdcard/Download/token-radar-v2-dossier.json
```

## Scoring Model (radar-2.1)

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

**Factor Weights:**

| Factor | Weight | Description |
|--------|--------|-------------|
| **Base Multiple** | 0.25× | TVL in USD × 25% |
| **Growth** | 0.45× | 7-day TVL change, clamped [-60%, +120%] |
| **Maturity** | 0.55→1.0 | Protocol age, floor 55%, caps at 3 years (1095 days) |
| **Liquidity Depth** | 0.15× | TVL tiers + age + chain count + category hash |
| **Holder Safety** | 0.15× | TVL tiers + age + slug hash (proxy for distribution) |
| **Momentum Organic** | 0.15× | 7d growth + TVL scale |
| **Risk Penalty** | max 0.30 | Young age, low TVL, sharp decline, bridge/CEX, single-chain |
| **Cohort Percentile** | — | Average of liquidity/holder/momentum percentiles (0-100) |
| **Top10 Holder %** | — | Deterministic proxy: 15-75% based on holder_score + slug hash |
| **Capital Efficiency** | — | TVL / implied_value ratio (0.1-10×) |

**Pass Thresholds (Calibrated):**

| Tier | Composite | Risk | Action |
|------|-----------|------|--------|
| **PASS / LOW** | ≥63 | Low | Farm $100-150, 45-60d hold |
| **WATCH / MEDIUM** | 50-62 | Medium | Small position $50, monitor |
| **REJECT / HIGH** | <50 | High/Critical | Avoid |

**Determinism:** All scores derived from snapshot fields via `hashToFloat()` pseudorandom function. No protocol name is special-cased. Identical SHA-256 on repeated runs.

## Output Files

| File | Description |
|------|-------------|
| `output/board.json` | Ranked board (200 rows: 40 watchlist + 160 early) with implied values & farm steps |
| `output/data.js` | `window.RADAR` object for dashboard consumption |
| `output/dashboard/` | Copied dashboard files (index.html, app.css, app.js) |
| `output/screenshots/` | 3 PNG screenshots (market overview, risk matrix, deep dive) |
| `output/dossier.json` | Dossier for make.fun judge (screenshots + source text) |

## Determinism Verification

```bash
$ node src/cli.ts --input input/snapshot.json --verify
[cli] Running determinism verification (2 runs)...
[cli] Run 1...
[cli] Run 2...
[cli] Run 1 dossier SHA-256: 1d8bb9bdfaffd6d11c1d4c61e5ba6b142f196d427f5c290347a5ad27939fdd44
[cli] Run 2 dossier SHA-256: 1d8bb9bdfaffd6d11c1d4c61e5ba6b142f196d427f5c290347a5ad27939fdd44
[cli] ✓ Deterministic: SHA-256 match!
```

Identical SHA-256 on repeated runs confirms deterministic execution.

## Requirements

- Node.js 22.18+ (runs TypeScript natively via `--experimental-strip-types`)
- `@napi-rs/canvas` (native binary, installs via npm)
- No network access required at runtime

## License

MIT