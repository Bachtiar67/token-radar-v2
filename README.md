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
├── screenshots/             # Generated PNG screenshots (3 files)
├── output/                  # Runtime output (board.json, data.js, dossier.json, etc.)
├── input/
│   └── snapshot.json        # Sealed protocol snapshot (DefiLlama data)
└── package.json
```

## Scoring Model (radar-2)

```
implied = round(
  tvl_usd × 0.25
  × (1 + clamp(change_7d, -60, 120) / 100 × 0.45)
  × (0.55 + min(age_days, 1095) / 1095 × 0.45)
  × (1 + (liquidity - 0.5) × 0.15 + (holders - 0.5) × 0.15 + (momentum - 0.5) × 0.15)
  × (1 - risk_penalty)
)
```

**Factors:**
- **Base**: TVL × 0.25
- **Growth**: 7-day TVL change, clamped to [-60%, 120%], weighted 45%
- **Maturity**: Protocol age (days since listed), floor 55%, caps at 3 years
- **Liquidity**: Derived from TVL, age, chain count, category (0–1)
- **Holders**: Derived from TVL, age (0–1)
- **Momentum**: Derived from 7d growth, TVL (0–1)
- **Risk penalty**: Young age, low TVL, sharp decline, bridge/CEX category, single-chain concentration — max 30%

All scores are deterministic — derived from snapshot fields via hash-based pseudorandom functions. No protocol name is special-cased.

## Output Files

| File | Description |
|------|-------------|
| `output/board.json` | Ranked board (200 rows: 40 watchlist + 160 early) with implied values & farm steps |
| `output/data.js` | `window.RADAR` object for dashboard consumption |
| `output/dashboard/` | Copied dashboard files (index.html, app.css, app.js) |
| `output/screenshots/` | 3 PNG screenshots (board, detail, filtered) |
| `output/dossier.json` | Dossier for make.fun judge (screenshots + source text) |

## Determinism Verification

```bash
$ node src/cli.ts --input input/snapshot.json --verify
[cli] Running determinism verification (2 runs)....
[cli] Run 1...
[cli] Run 2...
[cli] Run 1 dossier SHA-256: c0193c3fa2ca3ae43c5e3947286c0fa9db883b253390288dd2be03de3459faf9
[cli] Run 2 dossier SHA-256: c0193c3fa2ca3ae43c5e3947286c0fa9db883b253390288dd2be03de3459faf9
[cli] ✓ Deterministic: SHA-256 match!
```

Identical SHA-256 on repeated runs confirms deterministic execution.

## Requirements

- Node.js 22.18+ (runs TypeScript natively via `--experimental-strip-types`)
- `@napi-rs/canvas` (native binary, installs via npm)
- No network access required at runtime

## License

MIT