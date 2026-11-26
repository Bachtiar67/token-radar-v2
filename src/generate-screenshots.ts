// Token Radar v2 - Screenshot Generator
// Uses @napi-rs/canvas to generate deterministic PNG screenshots
// No browser/Playwright needed - works on Android ARM64

import { createCanvas, loadImage } from '@napi-rs/canvas';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const projectRoot = join(here, '..');
const outputDir = join(projectRoot, 'output');
const screenshotsDir = join(projectRoot, 'screenshots');

const WIDTH = 1440;
const HEIGHT = 900;
const DPR = 1;

const COLORS = {
  canvas: '#0d1117',
  surface: '#161b22',
  surfaceElevated: '#21262d',
  ink: '#e6edf3',
  muted: '#8b949e',
  border: '#30363d',
  accent: '#58a6ff',
  positive: '#3fb950',
  negative: '#f85149',
  warning: '#d29922',
};

function fmtUsd(n: number): string {
  if (!isFinite(n)) return 'n/a';
  if (Math.abs(n) >= 1e12) return '$' + (n / 1e12).toFixed(2) + 'T';
  if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
  if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
  if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

function fmtPct(n: number | null): string {
  if (n === null || !isFinite(n)) return 'n/a';
  return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
}

function fmtAge(days: number | null): string {
  if (days === null) return 'unknown';
  if (days >= 365) return (days / 365).toFixed(1) + 'y';
  return Math.max(0, Math.round(days)) + 'd';
}

function scoreClass(score: number): 'high' | 'medium' | 'low' {
  if (score >= 0.75) return 'high';
  if (score >= 0.5) return 'medium';
  return 'low';
}

function drawRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, opts: {
  font?: string;
  color?: string;
  align?: CanvasTextAlign;
  baseline?: CanvasTextBaseline;
  maxWidth?: number;
} = {}) {
  ctx.font = opts.font || '14px system-ui, -apple-system, "Segoe UI", sans-serif';
  ctx.fillStyle = opts.color || COLORS.ink;
  ctx.textAlign = opts.align || 'left';
  ctx.textBaseline = opts.baseline || 'top';
  if (opts.maxWidth) {
    ctx.fillText(text, x, y, opts.maxWidth);
  } else {
    ctx.fillText(text, x, y);
  }
}

function drawTableHeader(ctx: CanvasRenderingContext2D, columns: { title: string; x: number; width: number }[], y: number) {
  ctx.fillStyle = COLORS.surfaceElevated;
  ctx.fillRect(40, y, WIDTH - 80, 36);

  ctx.font = 'bold 11px system-ui, -apple-system, "Segoe UI", sans-serif';
  ctx.fillStyle = COLORS.muted;
  ctx.textBaseline = 'middle';

  columns.forEach(col => {
    drawText(ctx, col.title.toUpperCase(), col.x, y + 18, {
      font: 'bold 11px system-ui, -apple-system, "Segoe UI", sans-serif',
      color: COLORS.muted,
      baseline: 'middle'
    });
  });
}

function drawTableRow(ctx: CanvasRenderingContext2D, rowData: { x: number; text: string; color?: string; font?: string; align?: CanvasTextAlign }[], y: number, selected: boolean) {
  if (selected) {
    ctx.fillStyle = 'rgba(88, 166, 255, 0.12)';
    ctx.fillRect(40, y, WIDTH - 80, 40);
    ctx.fillStyle = COLORS.accent;
    ctx.fillRect(40, y, 3, 40);
  } else {
    ctx.fillStyle = COLORS.surface;
    ctx.fillRect(40, y, WIDTH - 80, 40);
  }

  ctx.strokeStyle = COLORS.border;
  ctx.beginPath();
  ctx.moveTo(40, y + 40);
  ctx.lineTo(WIDTH - 40, y + 40);
  ctx.stroke();

  ctx.textBaseline = 'middle';
  rowData.forEach(rd => {
    drawText(ctx, rd.text, rd.x, y + 20, {
      font: rd.font || '13px ui-monospace, "SF Mono", Menlo, monospace',
      color: rd.color || COLORS.ink,
      align: rd.align || 'left'
    });
  });
}

function loadRadarData() {
  const dataPath = join(outputDir, 'data.js');
  if (!existsSync(dataPath)) {
    throw new Error('data.js not found. Run main.ts first.');
  }
  const content = readFileSync(dataPath, 'utf8');
  const match = content.match(/window\.RADAR=(\{.*\});/);
  if (!match) {
    throw new Error('Could not parse RADAR data');
  }
  return JSON.parse(match[1]);
}

async function generateBoardScreenshot() {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');
  const radar = loadRadarData();

  // Background
  ctx.fillStyle = COLORS.canvas;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Header
  ctx.fillStyle = COLORS.surface;
  ctx.fillRect(0, 0, WIDTH, 80);
  ctx.strokeStyle = COLORS.border;
  ctx.beginPath();
  ctx.moveTo(0, 80);
  ctx.lineTo(WIDTH, 80);
  ctx.stroke();

  // Brand
  ctx.fillStyle = COLORS.accent;
  ctx.beginPath();
  ctx.arc(50, 40, 6, 0, Math.PI * 2);
  ctx.fill();
  drawText(ctx, 'TOKEN RADAR v2', 65, 30, {
    font: 'bold 12px ui-monospace, "SF Mono", Menlo, monospace',
    color: COLORS.muted
  });

  // Meta
  drawText(ctx, `Snapshot ${radar.as_of}  |  DefiLlama Protocol Index  |  ${radar.model_version} model`, WIDTH - 60, 40, {
    font: '12px system-ui',
    color: COLORS.muted,
    align: 'right'
  });

  // Lede
  let y = 100;
  drawText(ctx, `${radar.watchlist_size} watchlist protocols, ranked by multi-factor implied value`, 60, y, {
    font: 'bold 28px system-ui, -apple-system, "Segoe UI", sans-serif',
    color: COLORS.ink
  });
  y += 40;
  drawText(ctx, 'The watchlist is the floor: every protocol with at least $' + Math.round(radar.floor_usd / 1e6) + 'M of TVL and no token on record. The early radar adds ' + radar.early_size + ' pre-token protocols below that floor. Implied value combines TVL, 7d growth, protocol age, liquidity depth, holder distribution, volume momentum, and risk flags.', 60, y, {
    font: '14px system-ui',
    color: COLORS.muted,
    maxWidth: 800
  });

  // Facts
  y += 50;
  const facts = [
    ['Watchlist covered', radar.watchlist_size + ' / ' + radar.watchlist_size],
    ['Pre-token rows scored', String(radar.board_size)],
    ['Early rows below the floor', String(radar.early_size)],
    ['Live-token protocols set aside', String(radar.live_size)],
  ];
  facts.forEach(([label, value]) => {
    drawText(ctx, label, 60, y, { font: '13px system-ui', color: COLORS.muted });
    drawText(ctx, value, 400, y, { font: 'bold 14px ui-monospace', color: COLORS.ink });
    y += 24;
  });

  // Controls bar
  y += 10;
  ctx.fillStyle = COLORS.surface;
  ctx.fillRect(40, y, WIDTH - 80, 50);
  ctx.strokeStyle = COLORS.border;
  ctx.strokeRect(40, y, WIDTH - 80, 50);

  drawText(ctx, 'Search', 60, y + 12, { font: '11px system-ui', color: COLORS.muted });
  ctx.fillStyle = COLORS.surfaceElevated;
  drawRoundedRect(ctx, 55, y + 28, 300, 32, 8);
  ctx.fill();
  drawText(ctx, 'Search name, category or chain...', 65, y + 36, { font: '13px system-ui', color: COLORS.muted });

  drawText(ctx, 'Category', 420, y + 12, { font: '11px system-ui', color: COLORS.muted });
  ctx.fillStyle = COLORS.surfaceElevated;
  drawRoundedRect(ctx, 415, y + 28, 180, 32, 8);
  ctx.fill();
  drawText(ctx, 'All categories', 425, y + 36, { font: '13px system-ui', color: COLORS.muted });

  // Tabs
  ctx.fillStyle = COLORS.surfaceElevated;
  drawRoundedRect(ctx, 650, y + 18, 160, 32, 6);
  ctx.fill();
  ctx.fillStyle = COLORS.ink;
  drawRoundedRect(ctx, 653, y + 21, 74, 26, 4);
  ctx.fill();
  drawText(ctx, 'Pre-token', 663, y + 34, { font: 'bold 13px system-ui', color: COLORS.canvas, align: 'center', baseline: 'middle' });

  ctx.fillStyle = COLORS.surfaceElevated;
  drawRoundedRect(ctx, 730, y + 18, 160, 32, 6);
  ctx.fill();
  drawText(ctx, 'Live token', 740, y + 34, { font: 'bold 13px system-ui', color: COLORS.muted, align: 'center', baseline: 'middle' });

  // Table
  y += 70;
  const columns = [
    { title: 'Rank', x: 60, width: 50 },
    { title: 'Protocol', x: 130, width: 300 },
    { title: 'TVL', x: 450, width: 120 },
    { title: '7d %', x: 580, width: 80 },
    { title: 'Age', x: 680, width: 60 },
    { title: 'Liq', x: 760, width: 60 },
    { title: 'Hold', x: 840, width: 60 },
    { title: 'Mom', x: 920, width: 60 },
    { title: 'Implied Value', x: 1000, width: 160 },
    { title: 'Token', x: 1180, width: 80 },
    { title: 'Risk', x: 1280, width: 100 },
  ];

  drawTableHeader(ctx, columns, y);
  y += 40;

  const rows = radar.rows.slice(0, 15);
  rows.forEach((row, i) => {
    const growth = row.change_7d === null ? 'n/a' : fmtPct(row.change_7d);
    const growthColor = row.change_7d === null ? COLORS.muted : row.change_7d >= 0 ? COLORS.positive : COLORS.negative;
    const liqClass = scoreClass(row.liquidity_score || 0);
    const holdClass = scoreClass(row.holder_score || 0);
    const momClass = scoreClass(row.momentum_score || 0);
    const riskClass = (row.risk_flags && row.risk_flags.length >= 3) ? 'high' : (row.risk_flags && row.risk_flags.length >= 2) ? 'medium' : 'low';
    const riskColors: Record<string, string> = { high: COLORS.negative, medium: COLORS.warning, low: COLORS.positive };

    const rowData = [
      { x: 60, text: String(row.rank) },
      { x: 130, text: row.name, color: COLORS.ink },
      { x: 450, text: fmtUsd(row.tvl_usd), color: COLORS.ink, font: '13px ui-monospace' },
      { x: 580, text: growth, color: growthColor, font: '13px ui-monospace' },
      { x: 680, text: fmtAge(row.age_days), color: COLORS.muted, font: '13px ui-monospace' },
      { x: 760, text: Math.round((row.liquidity_score || 0) * 100) + '%', color: COLORS.accent, font: '13px ui-monospace' },
      { x: 840, text: Math.round((row.holder_score || 0) * 100) + '%', color: COLORS.accent, font: '13px ui-monospace' },
      { x: 920, text: Math.round((row.momentum_score || 0) * 100) + '%', color: COLORS.accent, font: '13px ui-monospace' },
      { x: 1000, text: fmtUsd(row.implied_value_usd), color: COLORS.ink, font: 'bold 13px ui-monospace' },
      { x: 1180, text: 'no token', color: COLORS.warning },
      { x: 1280, text: row.risk_flags && row.risk_flags.length ? row.risk_flags.length + ' flags' : 'low risk', color: riskColors[riskClass] },
    ];

    drawTableRow(ctx, rowData, y, i === 0);
    y += 40;
  });

  // Model panel
  y += 20;
  ctx.fillStyle = COLORS.surface;
  drawRoundedRect(ctx, 40, y, WIDTH - 80, 180, 12);
  ctx.fill();
  ctx.strokeStyle = COLORS.border;
  ctx.stroke();

  drawText(ctx, 'How implied value is computed (radar-2)', 60, y + 20, { font: 'bold 16px system-ui', color: COLORS.ink });
  drawText(ctx, 'implied = round( tvl_usd x 0.25 x (1 + clamp(change_7d, -60, 120) / 100 x 0.45) x (0.55 + min(age_days, 1095) / 1095 x 0.45) x (1 + (liq-0.5)x0.15+(hold-0.5)x0.15+(mom-0.5)x0.15) x (1-risk_penalty) )', 60, y + 50, {
    font: '12px ui-monospace, "SF Mono", Menlo, monospace',
    color: COLORS.muted,
    maxWidth: WIDTH - 120
  });

  const buffer = canvas.toBuffer('image/png');
  const outputPath = join(screenshotsDir, '1-board.png');
  mkdirSync(screenshotsDir, { recursive: true });
  writeFileSync(outputPath, buffer);
  console.log(`Generated: ${outputPath} (${buffer.length} bytes)`);
  return outputPath;
}

async function generateDetailScreenshot() {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');
  const radar = loadRadarData();

  const row = radar.rows[0];

  ctx.fillStyle = COLORS.canvas;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Header bar
  ctx.fillStyle = COLORS.surface;
  ctx.fillRect(0, 0, WIDTH, 80);
  ctx.strokeStyle = COLORS.border;
  ctx.beginPath();
  ctx.moveTo(0, 80);
  ctx.lineTo(WIDTH, 80);
  ctx.stroke();

  drawText(ctx, 'TOKEN RADAR v2', 50, 30, { font: 'bold 12px ui-monospace', color: COLORS.muted });
  drawText(ctx, `Rank ${row.rank} of ${radar.board_size}`, 50, 50, { font: '12px system-ui', color: COLORS.accent });

  // Close button
  ctx.fillStyle = COLORS.surfaceElevated;
  drawRoundedRect(ctx, WIDTH - 100, 24, 80, 32, 8);
  ctx.fill();
  drawText(ctx, 'Close', WIDTH - 60, 40, { font: '13px system-ui', color: COLORS.ink, align: 'center', baseline: 'middle' });

  // Detail content
  let y = 120;
  drawText(ctx, row.name, 60, y, { font: 'bold 28px system-ui', color: COLORS.ink });
  y += 40;
  drawText(ctx, (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain'), 60, y, { font: '14px system-ui', color: COLORS.muted });

  // Implied value breakdown
  y += 40;
  ctx.fillStyle = COLORS.surface;
  drawRoundedRect(ctx, 40, y, WIDTH - 80, 320, 12);
  ctx.fill();
  ctx.strokeStyle = COLORS.border;
  ctx.stroke();

  drawText(ctx, 'Implied value breakdown', 60, y + 20, { font: 'bold 15px system-ui', color: COLORS.ink });

  const equations = [
    ['TVL', fmtUsd(row.tvl_usd), COLORS.ink],
    ['Seven-day growth', fmtPct(row.change_7d), row.change_7d !== null && row.change_7d >= 0 ? COLORS.positive : COLORS.negative],
    ['Age with no token', fmtAge(row.age_days), COLORS.muted],
    ['Growth multiplier', String(row.growth_multiplier), COLORS.ink],
    ['Maturity multiplier', String(row.maturity_multiplier), COLORS.ink],
    ['Liquidity score', row.liquidity_score ? Math.round(row.liquidity_score * 10000) / 100 + '%' : 'n/a', COLORS.accent],
    ['Holder score', row.holder_score ? Math.round(row.holder_score * 10000) / 100 + '%' : 'n/a', COLORS.accent],
    ['Momentum score', row.momentum_score ? Math.round(row.momentum_score * 10000) / 100 + '%' : 'n/a', COLORS.accent],
    ['Risk penalty', '-' + Math.round((row.risk_penalty || 0) * 10000) / 100 + '%', COLORS.negative],
    ['Implied value', fmtUsd(row.implied_value_usd), COLORS.ink],
  ];

  let eqY = y + 50;
  equations.forEach(([label, value, color]) => {
    drawText(ctx, label, 60, eqY, { font: '12px system-ui', color: COLORS.muted });
    drawText(ctx, value, WIDTH - 100, eqY, { font: 'bold 13px ui-monospace', color, align: 'right' });
    eqY += 26;
  });

  // Risk flags
  if (row.risk_flags && row.risk_flags.length > 0) {
    y += 340;
    ctx.fillStyle = COLORS.surface;
    drawRoundedRect(ctx, 40, y, WIDTH - 80, 140, 12);
    ctx.fill();
    ctx.strokeStyle = COLORS.border;
    ctx.stroke();

    drawText(ctx, 'Risk flags', 60, y + 20, { font: 'bold 15px system-ui', color: COLORS.ink });

    let flagY = y + 50;
    row.risk_flags.slice(0, 4).forEach((flag, i) => {
      const isHigh = flag.includes('Very young') || flag.includes('Sharp') || flag.includes('Centralized') || flag.includes('Bridge');
      const flagColor = isHigh ? COLORS.negative : COLORS.warning;
      ctx.fillStyle = flagColor + '33';
      drawRoundedRect(ctx, 60, flagY, WIDTH - 120, 28, 6);
      ctx.fill();
      ctx.strokeStyle = flagColor + '80';
      ctx.stroke();
      drawText(ctx, flag, 75, flagY + 14, { font: '12px system-ui', color: flagColor, baseline: 'middle' });
      flagY += 32;
    });
  }

  // Farm plan
  y = row.risk_flags && row.risk_flags.length > 0 ? y + 160 : y + 340;
  ctx.fillStyle = COLORS.surface;
  drawRoundedRect(ctx, 40, y, WIDTH - 80, 200, 12);
  ctx.fill();
  ctx.strokeStyle = COLORS.border;
  ctx.stroke();

  drawText(ctx, 'Farm plan', 60, y + 20, { font: 'bold 15px system-ui', color: COLORS.ink });

  const steps = [
    'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline. Cost: under $3 of gas for the first transaction. Time: 5 minutes.',
    'Supply $100 of USDC to ' + row.name + ' on ' + (row.chains[0] || 'its main chain') + ' and keep the position open. Cost: $100 of capital and about $4 of gas. Time: 15 minutes to set up.',
    'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote. Cost: about $2 of gas a week. Time: 10 minutes a week.',
    'Hold the position for at least 30 days so the activity is counted in more than one snapshot. Cost: the $100 stays in the position. Time: 30 days.',
    "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes. Cost: no fee to check, and never pay to claim. Time: 10 minutes.",
    'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it. Cost: nothing but the log. Time: 5 minutes.',
  ];

  let stepY = y + 50;
  steps.forEach((step, i) => {
    drawText(ctx, String(i + 1), 60, stepY, { font: 'bold 11px system-ui', color: COLORS.accent });
    drawText(ctx, step, 90, stepY, { font: '12px system-ui', color: COLORS.ink, maxWidth: WIDTH - 140 });
    stepY += 28;
  });

  const buffer = canvas.toBuffer('image/png');
  const outputPath = join(screenshotsDir, '2-detail.png');
  writeFileSync(outputPath, buffer);
  console.log(`Generated: ${outputPath} (${buffer.length} bytes)`);
  return outputPath;
}

async function generateFilteredScreenshot() {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');
  const radar = loadRadarData();

  // Filter: high liquidity + positive growth
  const filtered = radar.rows.filter(r =>
    (r.liquidity_score || 0) >= 0.7 &&
    (r.change_7d || 0) > 0
  ).slice(0, 15);

  ctx.fillStyle = COLORS.canvas;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Header
  ctx.fillStyle = COLORS.surface;
  ctx.fillRect(0, 0, WIDTH, 80);
  ctx.strokeStyle = COLORS.border;
  ctx.beginPath();
  ctx.moveTo(0, 80);
  ctx.lineTo(WIDTH, 80);
  ctx.stroke();

  drawText(ctx, 'TOKEN RADAR v2', 50, 30, { font: 'bold 12px ui-monospace', color: COLORS.muted });
  drawText(ctx, `Filtered: High Liquidity (≥70%) + Positive 7d Growth  |  ${filtered.length} results`, WIDTH - 60, 40, {
    font: '12px system-ui',
    color: COLORS.accent,
    align: 'right'
  });

  // Active filter pills
  let y = 100;
  const pills = [
    { text: 'Liquidity ≥ 70%', color: COLORS.accent },
    { text: '7d Growth > 0%', color: COLORS.positive },
    { text: 'Pre-token only', color: COLORS.warning },
  ];
  let pillX = 60;
  pills.forEach(pill => {
    ctx.fillStyle = pill.color + '20';
    drawRoundedRect(ctx, pillX, y, 160, 32, 16);
    ctx.fill();
    ctx.strokeStyle = pill.color;
    ctx.stroke();
    drawText(ctx, pill.text, pillX + 80, y + 16, { font: 'bold 12px system-ui', color: pill.color, align: 'center', baseline: 'middle' });
    pillX += 180;
  });

  // Clear filters button
  ctx.fillStyle = COLORS.surfaceElevated;
  drawRoundedRect(ctx, pillX + 20, y, 120, 32, 8);
  ctx.fill();
  drawText(ctx, 'Clear all', pillX + 80, y + 16, { font: '13px system-ui', color: COLORS.muted, align: 'center', baseline: 'middle' });

  // Table
  y += 60;
  const columns = [
    { title: 'Rank', x: 60, width: 50 },
    { title: 'Protocol', x: 130, width: 300 },
    { title: 'TVL', x: 450, width: 120 },
    { title: '7d %', x: 580, width: 80 },
    { title: 'Age', x: 680, width: 60 },
    { title: 'Liq', x: 760, width: 60 },
    { title: 'Hold', x: 840, width: 60 },
    { title: 'Mom', x: 920, width: 60 },
    { title: 'Implied Value', x: 1000, width: 160 },
    { title: 'Risk', x: 1280, width: 100 },
  ];

  drawTableHeader(ctx, columns, y);
  y += 40;

  filtered.forEach((row, i) => {
    const growth = row.change_7d === null ? 'n/a' : fmtPct(row.change_7d);
    const growthColor = row.change_7d === null ? COLORS.muted : row.change_7d >= 0 ? COLORS.positive : COLORS.negative;
    const riskClass = (row.risk_flags && row.risk_flags.length >= 3) ? 'high' : (row.risk_flags && row.risk_flags.length >= 2) ? 'medium' : 'low';
    const riskColors: Record<string, string> = { high: COLORS.negative, medium: COLORS.warning, low: COLORS.positive };

    const rowData = [
      { x: 60, text: String(row.rank) },
      { x: 130, text: row.name, color: COLORS.ink },
      { x: 450, text: fmtUsd(row.tvl_usd), color: COLORS.ink, font: '13px ui-monospace' },
      { x: 580, text: growth, color: growthColor, font: '13px ui-monospace' },
      { x: 680, text: fmtAge(row.age_days), color: COLORS.muted, font: '13px ui-monospace' },
      { x: 760, text: Math.round((row.liquidity_score || 0) * 100) + '%', color: COLORS.positive, font: 'bold 13px ui-monospace' },
      { x: 840, text: Math.round((row.holder_score || 0) * 100) + '%', color: COLORS.accent, font: '13px ui-monospace' },
      { x: 920, text: Math.round((row.momentum_score || 0) * 100) + '%', color: COLORS.accent, font: '13px ui-monospace' },
      { x: 1000, text: fmtUsd(row.implied_value_usd), color: COLORS.ink, font: 'bold 13px ui-monospace' },
      { x: 1180, text: 'no token', color: COLORS.warning },
      { x: 1280, text: row.risk_flags && row.risk_flags.length ? row.risk_flags.length + ' flags' : 'low risk', color: riskColors[riskClass] },
    ];

    drawTableRow(ctx, rowData, y, false);
    y += 40;
  });

  // Stats summary
  y += 20;
  const avgLiq = filtered.reduce((s, r) => s + (r.liquidity_score || 0), 0) / filtered.length;
  const avgGrowth = filtered.reduce((s, r) => s + (r.change_7d || 0), 0) / filtered.length;
  const avgImplied = filtered.reduce((s, r) => s + r.implied_value_usd, 0) / filtered.length;

  ctx.fillStyle = COLORS.surface;
  drawRoundedRect(ctx, 40, y, WIDTH - 80, 100, 12);
  ctx.fill();
  ctx.strokeStyle = COLORS.border;
  ctx.stroke();

  drawText(ctx, 'Filtered set summary', 60, y + 20, { font: 'bold 15px system-ui', color: COLORS.ink });
  drawText(ctx, `Protocols: ${filtered.length}  |  Avg Liquidity: ${Math.round(avgLiq * 100)}%  |  Avg 7d Growth: ${avgGrowth.toFixed(2)}%  |  Avg Implied Value: ${fmtUsd(avgImplied)}`, 60, y + 50, { font: '13px system-ui', color: COLORS.muted });

  const buffer = canvas.toBuffer('image/png');
  const outputPath = join(screenshotsDir, '3-filtered.png');
  writeFileSync(outputPath, buffer);
  console.log(`Generated: ${outputPath} (${buffer.length} bytes)`);
  return outputPath;
}

async function main() {
  console.log('Generating screenshots...');

  await generateBoardScreenshot();
  await generateDetailScreenshot();
  await generateFilteredScreenshot();

  console.log('All screenshots generated successfully!');
}

main().catch(err => {
  console.error('Screenshot generation failed:', err);
  process.exit(1);
});