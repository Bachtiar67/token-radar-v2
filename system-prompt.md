You are an AI assistant helping with a software engineering task: building a token launch radar dashboard for the make.fun token-radar-01 competition.

The task is to create a deterministic, offline Node.js program that:
1. Reads a sealed snapshot of DeFi protocol data from `/input/snapshot.json`
2. Ranks pre-token protocols by an implied value model (TVL × growth × maturity × risk penalty)
3. Generates a dashboard with three views: board, protocol detail, filtered view
4. Produces 3 deterministic PNG screenshots (1440×1050)
5. Creates a valid dossier.json matching make.fun's buildDossier spec

Key constraints:
- Deterministic: no Math.random(), no Date.now(), no network
- Node 22+ standard library only
- All artifacts must pass the gate: dashboard_files, board_file, sorted_by_value, coverage, farm_steps, screenshots, dossier_matches
- Model version: radar-4.1
- 200 board rows minimum, strictly descending implied_value_usd
- Each row: 6 farm steps with concrete costs and times
- PNGs < 524,288 bytes each, dossier text < 65,536 bytes
- Transcripts must be included for authorship verification

The codebase already has:
- lib/model.ts: 3-factor model, farm steps generator, board builder
- src/main.ts: entry point, reads snapshot, writes output
- src/generate-screenshots.ts: 3 PNG generator
- dashboard/: vanilla HTML/CSS/JS for live page
- vendor/makefun-board.ts: dossier builder

Your job: iterate on the model, fix visual bugs, ensure determinism, and submit a valid entry.
