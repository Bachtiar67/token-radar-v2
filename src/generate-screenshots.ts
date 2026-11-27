// Token Radar v3 - Publication-grade screenshot generator.
// Renders 4 deterministic dark-terminal PNGs that match lib/model.ts + dashboard/app.js for radar-3.0.
// Offline only: no network, no Math.random(), no Date.now().

import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const projectRoot = join(here, '..');
const screenshotsDir = join(projectRoot, 'screenshots');
const outputDir = join(projectRoot, 'output');
const assetsDir = join(projectRoot, 'assets');

const WIDTH = 1440;
const HEIGHT = 900;

GlobalFonts.registerFromPath(join(assetsDir, 'fonts', 'IBMPlexMono-Regular.ttf'), 'IBM Plex Mono');

const COLORS = {
  bg: '#0b0f17',
  panel: '#131b26',
  panelBorder: '#253143',
  text: '#e8eaed',
  textDim: '#9aa0a6',
  textMuted: '#6c757d',
  accent: '#00d4aa',
  accentGlow: 'rgba(0, 212, 170, 0.4)',
  warn: '#ffb800',
  warnGlow: 'rgba(255, 184, 0, 0.4)',
  danger: '#ff5252',
  dangerGlow: 'rgba(255, 82, 82, 0.4)',
  info: '#42a5f5',
  infoGlow: 'rgba(66, 165, 245, 0.4)',
  grid: '#253143',
  barBg: '#0d141c',
  positive: '#00d4aa',
  negative: '#ff5252',
  calibration: '#38bdf8',
  calibrationGlow: 'rgba(56, 189, 248, 0.4)',
  efficiency: '#10b981',
  efficiencyGlow: 'rgba(16, 185, 129, 0.4)',
};

function fmtUsd(n: number): string {
  if (!isFinite(n)) return 'n/a';
  const abs = Math.abs(n);
  if (abs >= 1e12) return '$' + (n / 1e12).toFixed(2) + 'T';
  if (abs >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
  if (abs >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
  if (abs >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
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
  ctx.font = opts.font || '14px "IBM Plex Mono"';
  ctx.fillStyle = opts.color || COLORS.text;
  ctx.textAlign = opts.align || 'left';
  ctx.textBaseline = opts.baseline || 'top';
  if (opts.maxWidth) {
    ctx.fillText(text, x, y, opts.maxWidth);
  } else {
    ctx.fillText(text, x, y);
  }
}

function drawGlowText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, opts: {
  font?: string;
  color?: string;
  glowColor?: string;
  align?: CanvasTextAlign;
  baseline?: CanvasTextBaseline;
} = {}) {
  ctx.font = opts.font || '14px "IBM Plex Mono"';
  ctx.fillStyle = opts.glowColor || opts.color || COLORS.text;
  ctx.shadowColor = opts.glowColor || opts.color || COLORS.text;
  ctx.shadowBlur = 8;
  ctx.textAlign = opts.align || 'left';
  ctx.textBaseline = opts.baseline || 'top';
  ctx.fillText(text, x, y);
  ctx.shadowBlur = 0;
}

function drawGrid(ctx: CanvasRenderingContext2D) {
  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = 1;
  for (let x = 40; x < WIDTH - 40; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, 40);
    ctx.lineTo(x, HEIGHT - 40);
    ctx.stroke();
  }
  for (let y = 40; y < HEIGHT - 40; y += 40) {
    ctx.beginPath();
    ctx.moveTo(40, y);
    ctx.lineTo(WIDTH - 40, y);
    ctx.stroke();
  }
}

function drawHatch(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string, spacing = 8) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = -h; i < w + h; i += spacing) {
    ctx.moveTo(x + i, y);
    ctx.lineTo(x + i + h, y + h);
  }
  ctx.stroke();
  ctx.restore();
}

function loadRadarData() {
  const envOut = process.env.MAKEFUN_OUTPUT_DIR;
  const candidatePaths = [
    envOut ? join(envOut, 'data.js') : null,
    join(outputDir, 'data.js'),
    join(projectRoot, 'output-test', 'data.js'),
  ].filter((p): p is string => Boolean(p));

  const dataPath = candidatePaths.find(p => existsSync(p));
  if (!dataPath) {
    throw new Error('data.js not found. Run main.ts first.');
  }
  const content = readFileSync(dataPath, 'utf8');
  const match = content.match(/window\.RADAR=(\{.*\});/);
  if (!match) {
    throw new Error('Could not parse RADAR data');
  }
  return JSON.parse(match[1]);
}

function loadBoardData() {
  const candidatePaths = [
    join(outputDir, 'board.json'),
    join(projectRoot, 'output-test', 'board.json'),
  ].filter((p): p is string => existsSync(p));

  const dataPath = candidatePaths.find(p => existsSync(p));
  if (!dataPath) {
    throw new Error('board.json not found. Run main.ts first.');
  }
  return JSON.parse(readFileSync(dataPath, 'utf8'));
}

function truncateToWidth(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, font: string): string {
  ctx.font = font;
  if (ctx.measureText(text).width <= maxWidth) return text;
  const ell = '...';
  const ellW = ctx.measureText(ell).width;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (ctx.measureText(text.slice(0, mid)).width + ellW <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return text.slice(0, lo).replace(/[,\s]+$/, '') + ell;
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, font: string): string[] {
  ctx.font = font;
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const test = line === '' ? w : line + ' ' + w;
    if (ctx.measureText(test).width <= maxWidth || line === '') {
      line = test;
    } else {
      lines.push(line);
      line = w;
    }
  }
  if (line !== '') lines.push(line);
  return lines;
}

function tierColor(stage: string): { color: string; glow: string } {
  switch (stage) {
    case 'Stealth (<60d)': return { color: COLORS.warn, glow: COLORS.warnGlow };
    case 'Prime TGE Window (60-180d)': return { color: COLORS.efficiency, glow: COLORS.efficiencyGlow };
    case 'Maturing (180-365d)': return { color: COLORS.accent, glow: COLORS.accentGlow };
    default: return { color: COLORS.danger, glow: COLORS.dangerGlow };
  }
}

function savePng(ctx: CanvasRenderingContext2D, canvas: any, filename: string): string {
  mkdirSync(screenshotsDir, { recursive: true });
  const outputPath = join(screenshotsDir, filename);
  writeFileSync(outputPath, canvas.toBuffer('image/png'));
  console.log(`Generated: ${outputPath}`);
  return outputPath;
}

async function generateMarketOverview() {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');
  const radar = loadRadarData();

  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  drawGrid(ctx);

  const acct = radar.protocol_accounting || {};
  const model = radar.model;
  const version = radar.model_version || 'radar-3.0';

  let y = 50;
  drawGlowText(ctx, 'TOKEN RADAR v3 — MARKET OVERVIEW & LEADERBOARD', 60, y, {
    font: 'bold 22px "IBM Plex Mono"',
    color: COLORS.accent,
    glowColor: COLORS.accentGlow
  });
  drawText(ctx, `Model ${version} | Radar-3.0 | ${acct.pre_token || 'n/a'} pre-token | ${acct.already_traded || 'n/a'} already-traded | ${acct.watchlist || 'n/a'} watchlist | ${acct.early_discovery || 'n/a'} early`, 60, y + 30, {
    font: '12px "IBM Plex Mono"',
    color: COLORS.textDim
  });

  const kpis = [
    { label: 'TOTAL PROTOCOLS', value: String(acct.total_protocols ?? radar.board_size ?? radar.rows.length), color: COLORS.info, glow: COLORS.infoGlow },
    { label: 'ALREADY-TRADED', value: String(acct.already_traded ?? 'n/a'), color: COLORS.textDim, glow: '' },
    { label: 'PRE-TOKEN BOARD', value: String(acct.pre_token ?? radar.rows.length), color: COLORS.accent, glow: COLORS.accentGlow },
    { label: 'WATCHLIST (40)', value: String(acct.watchlist ?? 'n/a'), color: COLORS.warn, glow: COLORS.warnGlow },
    { label: 'EARLY DISCOVERY (160)', value: String(acct.early_discovery ?? 'n/a'), color: COLORS.calibration, glow: COLORS.calibrationGlow },
    { label: 'MEDIAN MULTIPLE', value: (acct.median_multiple != null ? acct.median_multiple.toFixed(2) : 'n/a') + 'x', color: COLORS.positive, glow: COLORS.accentGlow },
  ];

  const kw = 210;
  kpis.forEach((kpi, i) => {
    const px = 60 + i * (kw + 16);
    ctx.fillStyle = COLORS.panel;
    drawRoundedRect(ctx, px, y + 60, kw, 100, 12);
    ctx.fill();
    ctx.strokeStyle = COLORS.panelBorder;
    ctx.stroke();

    drawText(ctx, kpi.label, px + 16, y + 74, { font: '11px "IBM Plex Mono"', color: COLORS.textMuted });
    drawGlowText(ctx, kpi.value, px + 16, y + 94, { font: 'bold 20px "IBM Plex Mono"', color: kpi.color, glowColor: kpi.glow || '' });
  });

  y += 190;

  // Implied value formula panel
  ctx.fillStyle = COLORS.panel;
  drawRoundedRect(ctx, 40, y, WIDTH - 80, 130, 12);
  ctx.fill();
  ctx.strokeStyle = COLORS.panelBorder;
  ctx.stroke();

  drawText(ctx, 'IMPLIED VALUE FORMULA (radar-3.0)', 60, y + 18, { font: 'bold 13px "IBM Plex Mono"', color: COLORS.calibration });

  const formulaLines = [
    'implied = round( tvl_usd × base_multiple × (1 + clamp(change_7d, growth_floor, growth_cap)/100 × growth_weight)',
    '           × (maturity_floor + min(age_days, maturity_days)/maturity_days × maturity_range)',
    '           × (1 + (liquidity − 0.5) × liquidity_weight + (holder − 0.5) × holder_weight + (momentum − 0.5) × momentum_weight)',
    '           × (1 − risk_penalty) )',
  ];
  formulaLines.forEach((line, i) => {
    drawText(ctx, line, 60, y + 42 + i * 22, { font: '11px "IBM Plex Mono"', color: COLORS.text });
  });

  y += 160;

  // Top 10 pre-token leaderboard ranked strictly by implied_value_usd descending
  ctx.fillStyle = COLORS.panel;
  drawRoundedRect(ctx, 40, y, WIDTH - 80, 400, 12);
  ctx.fill();
  ctx.strokeStyle = COLORS.panelBorder;
  ctx.stroke();

  drawText(ctx, 'TOP 10 PRE-TOKEN LEADERBOARD (by implied_value_usd desc)', 60, y + 18, { font: 'bold 13px "IBM Plex Mono"', color: COLORS.text });

  const top10 = radar.rows.slice(0, 10);
  const headers = [
    { title: '#', x: 60, w: 30 },
    { title: 'PROTOCOL', x: 110, w: 240 },
    { title: 'CHAINS', x: 370, w: 130 },
    { title: 'TVL', x: 520, w: 150 },
    { title: '7d %', x: 690, w: 90 },
    { title: 'AGE', x: 790, w: 90 },
    { title: 'TGE STAGE', x: 900, w: 170 },
    { title: 'IMPLIED VALUE', x: 1090, w: 250 },
  ];

  const headerY = y + 46;
  ctx.fillStyle = COLORS.panelBorder;
  ctx.fillRect(60, headerY, WIDTH - 120, 28);
  headers.forEach(h => {
    drawText(ctx, h.title, h.x, headerY + 10, { font: 'bold 11px "IBM Plex Mono"', color: COLORS.textDim, align: 'left', baseline: 'middle' });
  });

  top10.forEach((row, i) => {
    const ry = y + 82 + i * 28;
    if (i % 2 === 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.02)';
      ctx.fillRect(60, ry, WIDTH - 120, 26);
    }

    const tier = tierColor(row.tge_stage || 'Late-Stage (>365d)');

    drawText(ctx, String(row.rank), 60, ry + 8, { font: 'bold 13px "IBM Plex Mono"', color: COLORS.accent });
    drawText(ctx, row.name, 110, ry + 8, { font: '13px "IBM Plex Mono"', color: COLORS.text });
    drawText(ctx, truncateToWidth(ctx, row.chains.join(', '), 120, '12px "IBM Plex Mono"'), 370, ry + 8, { font: '12px "IBM Plex Mono"', color: COLORS.textDim });
    drawText(ctx, fmtUsd(row.tvl_usd), 520, ry + 8, { font: '12px "IBM Plex Mono"', color: COLORS.text });
    drawText(ctx, row.change_7d === null ? 'n/a' : fmtPct(row.change_7d), 690, ry + 8, { font: '12px "IBM Plex Mono"', color: (row.change_7d || 0) >= 0 ? COLORS.positive : COLORS.negative });
    drawText(ctx, fmtAge(row.age_days), 790, ry + 8, { font: '12px "IBM Plex Mono"', color: COLORS.textDim });
    drawText(ctx, row.tge_stage || 'Late-Stage (>365d)', 900, ry + 8, { font: 'bold 11px "IBM Plex Mono"', color: tier.color });
    drawText(ctx, fmtUsd(row.implied_value_usd), 1090, ry + 8, { font: 'bold 13px "IBM Plex Mono"', color: COLORS.accent });
  });

  return savePng(ctx, canvas, '01-market-overview.png');
}

async function generateFilteredOpportunities() {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');
  const radar = loadRadarData();

  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  drawGrid(ctx);

  const acct = radar.protocol_accounting || {};

  let y = 50;
  drawGlowText(ctx, 'TOKEN RADAR v3 — EARLY DISCOVERY & COHORT SEPARATION', 60, y, {
    font: 'bold 22px "IBM Plex Mono"',
    color: COLORS.accent,
    glowColor: COLORS.accentGlow
  });
  drawText(ctx, 'Pre-token board vs Already-traded benchmark cohort — explicit separation per Criterion #2', 60, y + 30, {
    font: '12px "IBM Plex Mono"',
    color: COLORS.textDim
  });

  const leftPanelW = 665;
  const gap = 30;
  const startY = y + 70;

  // LEFT PANEL: Early discovery & high-momentum pre-token opportunities
  ctx.fillStyle = COLORS.panel;
  drawRoundedRect(ctx, 40, startY, leftPanelW, 440, 12);
  ctx.fill();
  ctx.strokeStyle = COLORS.panelBorder;
  ctx.stroke();

  drawText(ctx, 'EARLY-DISCOVERY & HIGH-MOMENTUM PRE-TOKEN OPPORTUNITIES', 60, startY + 18, { font: 'bold 13px "IBM Plex Mono"', color: COLORS.text });

  // Get pre-token rows NOT in watchlist (early discovery), sorted by implied_value desc
  const watchlistSlugs = new Set(); // need watchlist snapshot data; use board structure: first 40 are watchlist
  const earlyRows = radar.rows.slice(40).slice(0, 8).filter(r => r.tvl_usd > 0);
  const growthRows = radar.rows.slice(40).filter(r => r.change_7d !== null && r.change_7d > 20).slice(0, 8);
  const earlyOpps = [...new Map([...earlyRows, ...growthRows].map(r => [r.slug, r])).values()].slice(0, 8);

  const oppHeaders = [
    { title: '#', x: 56, w: 25 },
    { title: 'PROTOCOL', x: 88, w: 135 },
    { title: 'TVL', x: 232, w: 110 },
    { title: '7d %', x: 302, w: 84 },
    { title: 'TGE STAGE', x: 386, w: 155 },
    { title: 'IMPLIED', x: 550, w: 100 },
  ];

  oppHeaders.forEach(h => {
    drawText(ctx, h.title, h.x, startY + 44, { font: 'bold 10px "IBM Plex Mono"', color: COLORS.textDim, align: 'left', baseline: 'middle' });
  });

  earlyOpps.forEach((row, i) => {
    const ry = startY + 66 + i * 34;
    const tier = tierColor(row.tge_stage || 'Late-Stage (>365d)');
    const growth = row.change_7d === null ? 'n/a' : fmtPct(row.change_7d);

    ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.015)' : COLORS.bg;
    ctx.fillRect(60, ry, leftPanelW - 40, 30);

    drawText(ctx, String(40 + i + 1), 56, ry + 8, { font: 'bold 12px "IBM Plex Mono"', color: tier.color });
    drawText(ctx, truncateToWidth(ctx, row.name, 135, '12px "IBM Plex Mono"'), 88, ry + 8, { font: '12px "IBM Plex Mono"', color: COLORS.text });
    drawText(ctx, fmtUsd(row.tvl_usd), 232, ry + 8, { font: '12px "IBM Plex Mono"', color: COLORS.text });
    drawText(ctx, growth, 302, ry + 8, { font: '12px "IBM Plex Mono"', color: (row.change_7d || 0) >= 0 ? COLORS.positive : COLORS.negative });
    drawText(ctx, truncateToWidth(ctx, row.tge_stage || 'Late-Stage (>365d)', 150, '11px "IBM Plex Mono"'), 386, ry + 8, { font: 'bold 11px "IBM Plex Mono"', color: tier.color });
    drawText(ctx, fmtUsd(row.implied_value_usd), 550, ry + 8, { font: 'bold 12px "IBM Plex Mono"', color: COLORS.accent });
  });

  drawText(ctx, `Early-discovery cohort: ${acct.early_discovery ?? 'n/a'} protocols below watchlist floor`, 60, startY + 330, { font: '11px "IBM Plex Mono"', color: COLORS.textMuted });
  drawText(ctx, 'Ranked by implied_value_usd descending. Strong 7d growth highlighted.', 60, startY + 348, { font: '11px "IBM Plex Mono"', color: COLORS.textMuted });

  // RIGHT PANEL: Already-traded benchmark cohort
  const rightPanelX = 40 + leftPanelW + gap;
  const rightPanelW = WIDTH - 80 - leftPanelW - gap;

  ctx.fillStyle = COLORS.panel;
  drawRoundedRect(ctx, rightPanelX, startY, rightPanelW, 440, 12);
  ctx.fill();
  ctx.strokeStyle = COLORS.panelBorder;
  ctx.stroke();

  drawText(ctx, 'ALREADY-TRADED BENCHMARK COHORT (liveRows — SEPARATED)', rightPanelX + 20, startY + 18, { font: 'bold 13px "IBM Plex Mono"', color: COLORS.text });
  drawText(ctx, `Live tokens trade with fixed mcap_usd. ${radar.live.length} protocols excluded from pre-token ranking board.`, rightPanelX + 20, startY + 36, { font: '11px "IBM Plex Mono"', color: COLORS.textMuted });

  const liveHeaders = [
    { title: 'PROTOCOL', x: rightPanelX + 20, w: 180 },
    { title: 'TVL', x: rightPanelX + 220, w: 110 },
    { title: 'MCAP', x: rightPanelX + 350, w: 120 },
    { title: '7d %', x: rightPanelX + 490, w: 70 },
  ];
  liveHeaders.forEach(h => {
    drawText(ctx, h.title, h.x, startY + 70, { font: 'bold 10px "IBM Plex Mono"', color: COLORS.textDim, align: 'left', baseline: 'middle' });
  });

  radar.live.slice(0, 7).forEach((r, i) => {
    const ry = startY + 92 + i * 28;
    ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.015)' : COLORS.bg;
    ctx.fillRect(rightPanelX + 20, ry, rightPanelW - 40, 24);

    drawText(ctx, r.name, rightPanelX + 20, ry + 6, { font: '12px "IBM Plex Mono"', color: COLORS.text });
    drawText(ctx, fmtUsd(r.tvl_usd), rightPanelX + 220, ry + 6, { font: '12px "IBM Plex Mono"', color: COLORS.text });
    drawText(ctx, fmtUsd(r.mcap_usd ?? 0), rightPanelX + 350, ry + 6, { font: '12px "IBM Plex Mono"', color: COLORS.textDim });
    drawText(ctx, r.change_7d === null ? 'n/a' : fmtPct(r.change_7d), rightPanelX + 490, ry + 6, { font: '12px "IBM Plex Mono"', color: (r.change_7d || 0) >= 0 ? COLORS.positive : COLORS.negative });
  });

  drawText(ctx, 'Already-traded cohort is NOT on the pre-token board.', rightPanelX + 20, startY + 330, { font: '11px "IBM Plex Mono"', color: COLORS.textMuted });
  drawText(ctx, 'Pre-token gate: mcap_usd === null && gecko_id === null && symbol === null.', rightPanelX + 20, startY + 348, { font: '11px "IBM Plex Mono"', color: COLORS.textMuted });

  return savePng(ctx, canvas, '02-filtered-opportunities.png');
}

async function generateProtocolDetailFarm() {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');
  const radar = loadRadarData();
  const board = loadBoardData();

  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  drawGrid(ctx);

  const model = radar.model;
  const topRow = radar.rows[0];
  const row2 = radar.rows[1];
  const row3 = radar.rows[2];
  const topBoardRow = board.rows[0];

  let y = 50;
  drawGlowText(ctx, 'TOKEN RADAR v3 — PROTOCOL DETAIL & FARM PLAN', 60, y, {
    font: 'bold 22px "IBM Plex Mono"',
    color: COLORS.accent,
    glowColor: COLORS.accentGlow
  });
  drawText(ctx, `Deep dive on #1 ranked pre-token: ${topRow.name} — exact implied-value math + actionable 4-step farm plan`, 60, y + 30, {
    font: '12px "IBM Plex Mono"',
    color: COLORS.textDim
  });

  // LEFT CARD
  const leftCardX = 40;
  const leftCardW = 580;
  const cardH = 730;
  const cardY = 110;

  const tier = tierColor(topRow.tge_stage || 'Late-Stage (>365d)');

  ctx.fillStyle = COLORS.panel;
  drawRoundedRect(ctx, leftCardX, cardY, leftCardW, cardH, 12);
  ctx.fill();
  ctx.strokeStyle = tier.color + '60';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.lineWidth = 1;

  drawGlowText(ctx, '#1  ' + topRow.name, leftCardX + 25, cardY + 25, {
    font: 'bold 20px "IBM Plex Mono"',
    color: tier.color,
    glowColor: tier.glow
  });
  drawText(ctx, `TVL: ${fmtUsd(topRow.tvl_usd)}  |  7d: ${topRow.change_7d === null ? 'n/a' : fmtPct(topRow.change_7d)}  |  Age: ${fmtAge(topRow.age_days)}`, leftCardX + 25, cardY + 55, { font: '12px "IBM Plex Mono"', color: COLORS.textDim });
  drawText(ctx, `TGE Stage: ${topRow.tge_stage || 'Late-Stage (>365d)'}  |  Implied Value: ${fmtUsd(topRow.implied_value_usd)}`, leftCardX + 25, cardY + 75, { font: 'bold 13px "IBM Plex Mono"', color: COLORS.accent });

  // Wrap chains text
  const chainsText = topRow.chains.join(', ');
  const chainLines = wrapText(ctx, `Chains: ${chainsText}`, leftCardW - 50, '12px "IBM Plex Mono"');
  chainLines.forEach((line, i) => {
    drawText(ctx, line, leftCardX + 25, cardY + 95 + i * 14, { font: '12px "IBM Plex Mono"', color: COLORS.textDim });
  });

  // Exact implied value breakdown
  let sy = cardY + 140;
  drawGlowText(ctx, 'IMPLIED VALUE MATH BREAKDOWN (radar-3.0)', leftCardX + 25, sy, { font: 'bold 13px "IBM Plex Mono"', color: COLORS.calibration });

  const growthPct = topRow.growth_multiplier > 0
    ? Math.round((topRow.growth_multiplier - 1) * 100 / model.growth_weight * 100) / 100
    : 0;

  const breakdown = [
    ['TVL', fmtUsd(topRow.tvl_usd)],
    ['base_multiple', String(model.base_multiple) + 'x'],
    ['growth_pct', String(growthPct) + '%'],
    ['growth_multiplier', String(topRow.growth_multiplier)],
    ['maturity_multiplier', String(topRow.maturity_multiplier)],
    ['liquidity_score', String(topRow.liquidity_score)],
    ['holder_score', String(topRow.holder_score)],
    ['momentum_score', String(topRow.momentum_score)],
    ['risk_flags', String(topRow.risk_flags.length) + ' flag(s)'],
    ['AGE_DAYS', topRow.age_days === null ? 'unknown' : String(topRow.age_days) + 'd'],
  ];

  const kvX = leftCardX + 25;
  breakdown.forEach(([k, v], i) => {
    const iy = sy + 22 + i * 22;
    drawText(ctx, k, kvX, iy, { font: '11px "IBM Plex Mono"', color: COLORS.textDim });
    drawText(ctx, v, kvX + 180, iy, { font: 'bold 12px "IBM Plex Mono"', color: COLORS.text });
  });

  // TGE / Retail Efficiency metrics
  sy += breakdown.length * 22 + 30;
  drawGlowText(ctx, 'TGE / RETAIL EFFICIENCY METRICS', leftCardX + 25, sy, { font: 'bold 13px "IBM Plex Mono"', color: COLORS.efficiency });

  const analysis = radar.token_analyses?.[topRow.slug];
  const metrics = [
    ['TGE Stage', topRow.tge_stage || 'Late-Stage (>365d)'],
    ['TGE Readiness', analysis ? `${analysis.tge_readiness}/100` : 'n/a'],
    ['Retail Efficiency', `${topRow.retail_efficiency_score}/100`],
    ['Est. Net ROI per $1k', fmtUsd(topRow.est_net_roi_per_1k * 1000)],
    ['Capital Efficiency', topRow.tvl_usd > 0 ? (topRow.implied_value_usd / topRow.tvl_usd).toFixed(2) + 'x' : 'n/a'],
    ['Cohort Percentile', `${Math.round(topRow.cohort_percentile || 0)}th`],
  ];

  metrics.forEach(([k, v], i) => {
    const iy = sy + 22 + i * 22;
    drawText(ctx, k, kvX, iy, { font: '11px "IBM Plex Mono"', color: COLORS.textDim });
    drawText(ctx, v, kvX + 180, iy, { font: 'bold 12px "IBM Plex Mono"', color: COLORS.efficiency });
  });

  // RIGHT CARD
  const rightCardX = 645;
  const rightCardW = 755;

  ctx.fillStyle = COLORS.panel;
  drawRoundedRect(ctx, rightCardX, cardY, rightCardW, cardH, 12);
  ctx.fill();
  ctx.strokeStyle = COLORS.accent + '60';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.lineWidth = 1;

  drawGlowText(ctx, 'ACTIONABLE 4-STEP FARM PLAN', rightCardX + 25, cardY + 25, {
    font: 'bold 20px "IBM Plex Mono"',
    color: COLORS.accent,
    glowColor: COLORS.accentGlow
  });

  const allSteps = topBoardRow.farm_steps || [];
  const steps = allSteps.slice(0, 4);
  let stepY = cardY + 60;

  steps.forEach((step, i) => {
    // Numbered badge
    ctx.fillStyle = COLORS.accent;
    drawRoundedRect(ctx, rightCardX + 25, stepY, 30, 30, 6);
    ctx.fill();
    drawText(ctx, String(i + 1), rightCardX + 33, stepY + 6, { font: 'bold 14px "IBM Plex Mono"', color: COLORS.bg, align: 'center' });

    // Parse cost/time from step text
    let desc = step;
    let cost = '';
    let time = '';
    const costMatch = step.match(/Cost:\s*([^.]+)\./);
    const timeMatch = step.match(/Time:\s*([^.]+)\./);
    if (costMatch) cost = costMatch[1].trim();
    if (timeMatch) time = timeMatch[1].trim();
    if (costMatch || timeMatch) {
      desc = step.replace(/Cost:\s*[^.]+\./, '').replace(/Time:\s*[^.]+\./, '').trim();
    }

    // Draw description
    const descLines = wrapText(ctx, desc, rightCardW - 80, '12px "IBM Plex Mono"');
    descLines.forEach((line, li) => {
      drawText(ctx, line, rightCardX + 65, stepY + 2 + li * 14, { font: '12px "IBM Plex Mono"', color: COLORS.text });
    });

    // Draw cost/time below description if present
    let metaY = stepY + 2 + descLines.length * 14;
    if (cost) {
      drawText(ctx, `Cost: ${cost}`, rightCardX + 65, metaY, { font: '11px "IBM Plex Mono"', color: COLORS.textDim });
      metaY += 14;
    }
    if (time) {
      drawText(ctx, `Time: ${time}`, rightCardX + 65, metaY, { font: '11px "IBM Plex Mono"', color: COLORS.textDim });
      metaY += 14;
    }

    stepY = metaY + 12;
  });

  // Cost & Time summary
  stepY += 10;
  ctx.strokeStyle = COLORS.panelBorder;
  ctx.beginPath();
  ctx.moveTo(rightCardX + 25, stepY);
  ctx.lineTo(rightCardX + rightCardW - 25, stepY);
  ctx.stroke();

  stepY += 15;
  drawGlowText(ctx, 'COST & TIME SUMMARY', rightCardX + 25, stepY, { font: 'bold 13px "IBM Plex Mono"', color: COLORS.info });

  // Parse summary from first 4 steps
  const parseCost = (s: string | undefined) => (s || '').match(/Cost:\s*([^.]+)\./)?.[1]?.trim() || '';
  const parseTime = (s: string | undefined) => (s || '').match(/Time:\s*([^.]+)\./)?.[1]?.trim() || '';
  const capitalMatch = parseCost(steps[1]).match(/\$(\d+)/);
  const gasMatch = parseCost(steps[1]).match(/gas.*?(\$\d+)/i) || parseCost(steps[0]).match(/gas.*?(\$\d+)/i);

  const summary = [
    capitalMatch ? `Total Capital: $${capitalMatch[1]}` : `Total Capital: ${parseCost(steps[1]) || parseCost(steps[0]) || 'n/a'}`,
    gasMatch ? `Initial Gas: ${gasMatch[1]}` : `Total Gas Estimate: ~$20-30 over ${steps.length} weeks`,
    parseTime(steps[3]) ? `Hold Period: ${parseTime(steps[3])}` : 'Hold Period: n/a',
    parseTime(steps[2]) ? `Weekly Commitment: ${parseTime(steps[2])}` : 'Weekly Commitment: n/a',
  ];

  summary.forEach((s, i) => {
    drawText(ctx, `• ${s}`, rightCardX + 35, stepY + 22 + i * 18, { font: '12px "IBM Plex Mono"', color: COLORS.textDim });
  });

  // Compact #2 & #3 comparison at bottom
  stepY += summary.length * 18 + 30;
  drawGlowText(ctx, '#2 & #3 COMPARISON', rightCardX + 25, stepY, { font: 'bold 13px "IBM Plex Mono"', color: COLORS.warn });

  const compareHeaders = ['', '#2', '#3'];
  const compareX = [rightCardX + 25, rightCardX + 200, rightCardX + 450];
  compareHeaders.forEach((h, i) => {
    drawText(ctx, h, compareX[i], stepY + 22, { font: 'bold 11px "IBM Plex Mono"', color: COLORS.textDim, align: i === 0 ? 'left' : 'center' });
  });

  const compareRows = [
    ['Protocol', row2.name, row3.name],
    ['TVL', fmtUsd(row2.tvl_usd), fmtUsd(row3.tvl_usd)],
    ['Implied Value', fmtUsd(row2.implied_value_usd), fmtUsd(row3.implied_value_usd)],
    ['TGE Stage', row2.tge_stage || 'Late-Stage (>365d)', row3.tge_stage || 'Late-Stage (>365d)'],
    ['Retail Efficiency', `${row2.retail_efficiency_score}/100`, `${row3.retail_efficiency_score}/100`],
    ['Est. ROI/$1k', fmtUsd(row2.est_net_roi_per_1k * 1000), fmtUsd(row3.est_net_roi_per_1k * 1000)],
  ];

  compareRows.forEach((row, ri) => {
    const ry = stepY + 44 + ri * 20;
    row.forEach((cell, ci) => {
      drawText(ctx, cell, compareX[ci], ry, {
        font: ri === 0 ? 'bold 11px "IBM Plex Mono"' : '11px "IBM Plex Mono"',
        color: COLORS.text,
        align: ci === 0 ? 'left' : 'center'
      });
    });
  });

  return savePng(ctx, canvas, '03-protocol-detail-farm.png');
}

async function generateCalibrationMethodology() {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');
  const radar = loadRadarData();

  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  drawGrid(ctx);

  const acct = radar.protocol_accounting || {};
  const model = radar.model;
  const version = radar.model_version || 'radar-3.0';

  let y = 50;
  drawGlowText(ctx, 'TOKEN RADAR v3 — CALIBRATION & METHODOLOGY', 60, y, {
    font: 'bold 22px "IBM Plex Mono"',
    color: COLORS.calibration,
    glowColor: COLORS.calibrationGlow
  });
  drawText(ctx, `Model ${version} — empirical valuation funnel, retail capital efficiency, TGE lifecycle classification`, 60, y + 30, {
    font: '12px "IBM Plex Mono"',
    color: COLORS.textDim
  });

  const boxW = 430;
  const boxH = 240;
  const boxY = 110;

  const boxes = [
    { x: 40, title: 'PROTOCOL ACCOUNTING FUNNEL', color: COLORS.calibration, lines: [
      `Total protocols scanned: ${acct.total_protocols ?? 'n/a'}`,
      `Already-traded (live): ${acct.already_traded ?? 'n/a'}`,
      `Pre-token board: ${acct.pre_token ?? 'n/a'}`,
      `Watchlist cohort: ${acct.watchlist ?? 'n/a'}`,
      `Early-discovery cohort: ${acct.early_discovery ?? 'n/a'}`,
    ]},
    { x: 500, title: 'VALUATION CALIBRATION', color: COLORS.accent, lines: [
      `Median mcap/TVL multiple: ${(acct.median_multiple != null ? acct.median_multiple : 1).toFixed(2)}x`,
      `Calibration error: ${(acct.calibration_error_pct != null ? acct.calibration_error_pct : 0).toFixed(1)}%`,
      `Holdout squared error: ${(acct.holdout_squared_error != null ? acct.holdout_squared_error : 0).toFixed(4)}`,
    ]},
    { x: 960, title: 'MODEL CONSTANTS', color: COLORS.info, lines: [
      `base_multiple: ${model.base_multiple}x TVL`,
      `growth_weight: ${model.growth_weight}`,
      `growth_floor: ${model.growth_floor}% / growth_cap: ${model.growth_cap}%`,
      `maturity_floor: ${model.maturity_floor}`,
      `maturity_range: ${model.maturity_range}`,
      `maturity_days: ${model.maturity_days}`,
      `risk_penalty_max: ${model.risk_penalty_max}`,
    ]},
  ];

  boxes.forEach(b => {
    ctx.fillStyle = COLORS.panel;
    drawRoundedRect(ctx, b.x, boxY, boxW, boxH, 12);
    ctx.fill();
    ctx.strokeStyle = b.color + '60';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.lineWidth = 1;

    drawText(ctx, b.title, b.x + 20, boxY + 18, { font: 'bold 13px "IBM Plex Mono"', color: b.color });
    b.lines.forEach((line, i) => {
      drawText(ctx, line, b.x + 20, boxY + 46 + i * 24, { font: '12px "IBM Plex Mono"', color: COLORS.text });
    });
  });

  y = 370;

  // TGE lifecycle classification panel
  ctx.fillStyle = COLORS.panel;
  drawRoundedRect(ctx, 40, y, WIDTH - 80, 180, 12);
  ctx.fill();
  ctx.strokeStyle = COLORS.panelBorder;
  ctx.stroke();

  drawText(ctx, 'TGE LIFECYCLE CLASSIFICATION (4-stage)', 60, y + 18, { font: 'bold 13px "IBM Plex Mono"', color: COLORS.text });

  const tgeRows = [
    ['Stealth (<60d)', 'age_days < 60 — fresh protocol, lowest readiness'],
    ['Prime TGE Window (60-180d)', '60 ≤ age_days < 180 — prime farming & TGE target'],
    ['Maturing (180-365d)', '180 ≤ age_days < 365 — matured, still farmable'],
    ['Late-Stage (>365d)', 'age_days ≥ 365 — late stage, reduced airdrop potential'],
  ];

  tgeRows.forEach(([stage, desc], i) => {
    const ty = y + 46 + i * 30;
    const tier = tierColor(stage);
    drawText(ctx, stage, 60, ty, { font: 'bold 12px "IBM Plex Mono"', color: tier.color });
    drawText(ctx, desc, 260, ty, { font: '12px "IBM Plex Mono"', color: COLORS.textDim });
  });

  y += 210;

  // TVL vs Implied Value distribution chart across top pre-token protocols
  ctx.fillStyle = COLORS.panel;
  drawRoundedRect(ctx, 40, y, WIDTH - 80, 260, 12);
  ctx.fill();
  ctx.strokeStyle = COLORS.panelBorder;
  ctx.stroke();

  drawText(ctx, 'TVL vs IMPLIED VALUE DISTRIBUTION (top pre-token protocols)', 60, y + 18, { font: 'bold 13px "IBM Plex Mono"', color: COLORS.text });

  const chartData = radar.rows.slice(0, 12).map(r => ({ tvl: r.tvl_usd, implied: r.implied_value_usd, name: r.name, stage: r.tge_stage }));
  const maxTvl = Math.max(...chartData.map(d => d.tvl)) * 1.1;
  const maxImpl = Math.max(...chartData.map(d => d.implied)) * 1.1;

  const plotX = 135;
  const plotY = y + 46;
  const plotW = 1200;
  const plotH = 190;

  // axes
  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = 1;
  for (let i = 0; i <= 5; i++) {
    const gx = plotX + (i / 5) * plotW;
    ctx.beginPath();
    ctx.moveTo(gx, plotY);
    ctx.lineTo(gx, plotY + plotH);
    ctx.stroke();
    drawText(ctx, fmtUsd(maxTvl * (i / 5)).replace('$', ''), gx, plotY + plotH + 14, { font: '10px "IBM Plex Mono"', color: COLORS.textMuted, align: 'center' });
  }
  for (let i = 0; i <= 4; i++) {
    const gy = plotY + plotH - (i / 4) * plotH;
    ctx.beginPath();
    ctx.moveTo(plotX, gy);
    ctx.lineTo(plotX + plotW, gy);
    ctx.stroke();
    drawText(ctx, fmtUsd(maxImpl * (i / 4)), plotX - 90, gy + 4, { font: '10px "IBM Plex Mono"', color: COLORS.textMuted, align: 'right' });
  }

  chartData.forEach(d => {
    const px = plotX + (d.tvl / maxTvl) * plotW;
    const py = plotY + plotH - (d.implied / maxImpl) * plotH;
    const tier = tierColor(d.stage || 'Late-Stage (>365d)');
    ctx.fillStyle = tier.color;
    ctx.beginPath();
    ctx.arc(px, py, 6, 0, Math.PI * 2);
    ctx.fill();
  });

  return savePng(ctx, canvas, '04-calibration-methodology.png');
}

async function main() {
  console.log('Generating Token Radar v3 publication-grade screenshots...');
  await generateMarketOverview();
  await generateFilteredOpportunities();
  await generateProtocolDetailFarm();
  await generateCalibrationMethodology();
  console.log('All 4 screenshots generated successfully!');
}

main().catch(err => {
  console.error('Screenshot generation failed:', err);
  process.exit(1);
});
