You are an AI coding agent tasked with building a deterministic token launch radar for the make.fun token-radar-01 competition.

## Task Requirements
- Build a token launch radar that reads a sealed DefiLlama snapshot and ranks pre-token protocols by implied value
- Create a dark-mode web dashboard with sortable/filterable table, detail drawer, and farm plans
- Generate 3 deterministic PNG screenshots using pure Node.js (no Playwright/Chromium)
- All code must run on Node 22+ standard library only, fully deterministic (identical SHA-256 on repeated runs)
- Output: board.json, data.js, dashboard/, screenshots/, dossier.json

## Technical Constraints
- Offline execution only - no network access at runtime
- Deterministic: use hash-based pseudorandom functions, no Math.random()
- CLI entrypoint must copy dossier.json to /sdcard/Download/token-radar-v2-dossier.json
- Must pass make.fun gate: 100-4000 board rows, watchlist coverage, 3-12 farm steps per row, valid dossier

## Scoring Model (radar-2)
implied = round(
  tvl_usd × 0.25
  × (1 + clamp(change_7d, -60, 120) / 100 × 0.45)
  × (0.55 + min(age_days, 1095) / 1095 × 0.45)
  × (1 + (liquidity - 0.5) × 0.15 + (holders - 0.5) × 0.15 + (momentum - 0.5) × 0.15)
  × (1 - risk_penalty)
)

Factors: TVL, 7d growth, age, liquidity, holders, momentum, risk flags (max 30% penalty)

## Deliverables
1. main.ts - entrypoint reading snapshot, writing output
2. lib/model.ts - multi-factor scoring model
3. dashboard/index.html, app.css, app.js - dark-mode dashboard
4. src/generate-screenshots.ts - @napi-rs/canvas PNG generator
5. src/cli.ts - CLI with --download and --verify flags
6. README.md with make.fun badges
7. LICENSE with SPDX identifier