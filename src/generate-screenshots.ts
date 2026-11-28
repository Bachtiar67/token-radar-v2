// Token Radar v4 - Publication-grade screenshot generator.
// Renders 3 deterministic dark-terminal PNGs: board, protocol detail, filtered view.
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
const HEIGHT = 1050;

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

async function generateBoard() {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');
  const radar = loadRadarData();

  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  drawGrid(ctx);

  const acct = radar.protocol_accounting || {};
  const model = radar.model;
  const version = radar.model_version || 'radar-4.0';

  let y = 50;
  drawGlowText(ctx, 'TOKEN RADAR v4 — PRE-TOKEN BOARD', 60, y, {
    font: 'bold 22px "IBM Plex Mono"',
    color: COLORS.accent,
    glowColor: COLORS.accentGlow
  });
  drawText(ctx, `Model ${version} | ${acct.pre_token || radar.rows.length} pre-token | ${radar.live.length} already-traded | ${acct.watchlist || '—'} watchlist | ${acct.early_discovery || '—'} early`, 60, y + 30, {
    font: '12px "IBM Plex Mono"',
    color: COLORS.textDim
  });

  const kpis = [
    { label: 'TOTAL PROTOCOLS', value: String(acct.total_protocols ?? radar.board_size ?? radar.rows.length), color: COLORS.info, glow: COLORS.infoGlow },
    { label: 'ALREADY-TRADED', value: String(radar.live.length), color: COLORS.textDim, glow: '' },
    { label: 'PRE-TOKEN BOARD', value: String(acct.pre_token ?? radar.rows.length), color: COLORS.accent, glow: COLORS.accentGlow },
    { label: 'WATCHLIST (40)', value: String(acct.watchlist || '—'), color: COLORS.warn, glow: COLORS.warnGlow },
    { label: 'EARLY DISCOVERY (160)', value: String(acct.early_discovery || '—'), color: COLORS.efficiency, glow: COLORS.efficiencyGlow },
    { label: 'MEDIAN MULTIPLE', value: (acct.median_multiple != null ? acct.median_multiple.toFixed(2) : '—') + 'x', color: COLORS.positive, glow: COLORS.accentGlow },
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
  drawRoundedRect(ctx, 40, y, WIDTH - 80, 100, 12);
  ctx.fill();
  ctx.strokeStyle = COLORS.panelBorder;
  ctx.stroke();

  drawText(ctx, 'IMPLIED VALUE FORMULA (radar-4.0)', 60, y + 18, { font: 'bold 13px "IBM Plex Mono"', color: COLORS.efficiency });

  const formulaLines = [
    'implied = round( tvl_usd x base_multiple',
    '           x (1 + clamp(change_7d, growth_floor, growth_cap)/100 x growth_weight)',
    '           x (maturity_floor + min(age_days, maturity_days)/maturity_days x maturity_range)',
    '           x (1 - risk_penalty) )',
  ];
  formulaLines.forEach((line, i) => {
    drawText(ctx, line, 60, y + 42 + i * 22, { font: '11px "IBM Plex Mono"', color: COLORS.text });
  });

  y += 130;

  // Top 15 pre-token leaderboard ranked strictly by implied_value_usd descending
  ctx.fillStyle = COLORS.panel;
  drawRoundedRect(ctx, 40, y, WIDTH - 80, 530, 12);
  ctx.fill();
  ctx.strokeStyle = COLORS.panelBorder;
  ctx.stroke();

  drawText(ctx, 'TOP 15 PRE-TOKEN LEADERBOARD (by implied_value_usd desc)', 60, y + 18, { font: 'bold 13px "IBM Plex Mono"', color: COLORS.text });

  const top15 = radar.rows.slice(0, 15);
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

  top15.forEach((row, i) => {
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

  return savePng(ctx, canvas, '01-board.png');
}

async function generateProtocolDetail() {
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
  drawGlowText(ctx, 'TOKEN RADAR v4 — PROTOCOL DETAIL & FARM PLAN', 60, y, {
    font: 'bold 22px "IBM Plex Mono"',
    color: COLORS.accent,
    glowColor: COLORS.accentGlow
  });
  drawText(ctx, `Deep dive on #1 ranked pre-token: ${topRow.name} — exact implied-value math + actionable 6-step farm plan`, 60, y + 30, {
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
  drawText(ctx, `TVL: ${fmtUsd(topRow.tvl_usd)}  |  7d: ${topRow.change_7d === null ? '—' : fmtPct(topRow.change_7d)}  |  Age: ${fmtAge(topRow.age_days)}`, leftCardX + 25, cardY + 55, { font: '12px "IBM Plex Mono"', color: COLORS.textDim });
  // Wrap TGE Stage + Implied Value line
  const tgeLine = `TGE Stage: ${topRow.tge_stage || 'Late-Stage (>365d)'}  |  Implied Value: ${fmtUsd(topRow.implied_value_usd)}`;
  const tgeLines = wrapText(ctx, tgeLine, leftCardW - 50, 'bold 12px "IBM Plex Mono"');
  tgeLines.forEach((line, i) => {
    drawText(ctx, line, leftCardX + 25, cardY + 75 + i * 16, { font: 'bold 12px "IBM Plex Mono"', color: COLORS.accent });
  });

  // Wrap chains text
  const chainsText = topRow.chains.join(', ');
  const chainLines = wrapText(ctx, `Chains: ${chainsText}`, leftCardW - 50, '12px "IBM Plex Mono"');
  chainLines.forEach((line, i) => {
    drawText(ctx, line, leftCardX + 25, cardY + 75 + tgeLines.length * 16 + 5 + i * 14, { font: '12px "IBM Plex Mono"', color: COLORS.textDim });
  });

  // Exact implied value breakdown
  let sy = cardY + 140;
  drawGlowText(ctx, 'IMPLIED VALUE MATH BREAKDOWN (radar-4.0)', leftCardX + 25, sy, { font: 'bold 13px "IBM Plex Mono"', color: COLORS.efficiency });

  const growthPct = topRow.growth_multiplier > 0
    ? Math.round((topRow.growth_multiplier - 1) * 100 / model.growth_weight * 100) / 100
    : 0;

  const breakdown = [
    ['TVL', fmtUsd(topRow.tvl_usd)],
    ['base_multiple', String(model.base_multiple) + 'x'],
    ['growth_pct', String(growthPct) + '%'],
    ['growth_multiplier', String(topRow.growth_multiplier)],
    ['maturity_multiplier', String(topRow.maturity_multiplier)],
    ['risk_flags', String(topRow.risk_flags.length) + ' flag(s)'],
    ['AGE_DAYS', topRow.age_days === null ? '365d' : String(topRow.age_days) + 'd'],
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
    ['TGE Readiness', analysis ? `${analysis.tge_readiness}/100` : '—'],
    ['Retail Efficiency', `${topRow.retail_efficiency_score}/100`],
    ['Est. Net ROI per $1k', fmtUsd(topRow.est_net_roi_per_1k)],
    ['Capital Efficiency', topRow.tvl_usd > 0 ? (topRow.implied_value_usd / topRow.tvl_usd).toFixed(2) + 'x' : '—'],
    ['Cohort Percentile', `${Math.round(topRow.cohort_percentile || 0)}th`],
  ];

  metrics.forEach(([k, v], i) => {
    const iy = sy + 22 + i * 22;
    drawText(ctx, k, kvX, iy, { font: '11px "IBM Plex Mono"', color: COLORS.textDim });
    drawText(ctx, v, kvX + 180, iy, { font: 'bold 12px "IBM Plex Mono"', color: COLORS.efficiency });
  });

  // RIGHT CARD (with 16px padding on all sides)
  const rightCardX = 645;
  const rightCardW = 739; // reduced by 16px for right padding

  ctx.fillStyle = COLORS.panel;
  drawRoundedRect(ctx, rightCardX, cardY, rightCardW, cardH, 12);
  ctx.fill();
  ctx.strokeStyle = COLORS.accent + '60';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.lineWidth = 1;

  drawGlowText(ctx, 'ACTIONABLE 6-STEP FARM PLAN', rightCardX + 25, cardY + 25, {
    font: 'bold 20px "IBM Plex Mono"',
    color: COLORS.accent,
    glowColor: COLORS.accentGlow
  });

  const allSteps = topBoardRow.farm_steps || [];
  const steps = allSteps.slice(0, 6);
  let stepY = cardY + 58;

  steps.forEach((step, i) => {
    // Numbered badge
    ctx.fillStyle = COLORS.accent;
    drawRoundedRect(ctx, rightCardX + 20, stepY, 26, 26, 5);
    ctx.fill();
    drawText(ctx, String(i + 1), rightCardX + 28, stepY + 4, { font: 'bold 13px "IBM Plex Mono"', color: COLORS.bg, align: 'center' });

    // Parse cost/time from step text - use regex that preserves decimal points
    // Match until period followed by whitespace or end (not decimal point)
    let desc = step;
    let cost = '';
    let time = '';
    const costMatch = step.match(/Cost:\s*(.+?)\.(?=\s|$)/);
    const timeMatch = step.match(/Time:\s*(.+?)\.(?=\s|$)/);
    if (costMatch) cost = costMatch[1].trim();
    if (timeMatch) time = timeMatch[1].trim();
    if (costMatch || timeMatch) {
      desc = step.replace(/Cost:\s*.+?\.(?=\s|$)/, '').replace(/Time:\s*.+?\.(?=\s|$)/, '').trim();
    }

    // Draw description (smaller font, tighter line spacing, 16px right padding)
    const descLines = wrapText(ctx, desc, rightCardW - 80, '10px "IBM Plex Mono"');
    descLines.forEach((line, li) => {
      drawText(ctx, line, rightCardX + 55, stepY + 1 + li * 12, { font: '10px "IBM Plex Mono"', color: COLORS.text });
    });

    // Draw cost/time below description if present
    let metaY = stepY + 1 + descLines.length * 12;
    if (cost) {
      drawText(ctx, `Cost: ${cost}`, rightCardX + 55, metaY, { font: '9px "IBM Plex Mono"', color: COLORS.textDim });
      metaY += 11;
    }
    if (time) {
      drawText(ctx, `Time: ${time}`, rightCardX + 55, metaY, { font: '9px "IBM Plex Mono"', color: COLORS.textDim });
      metaY += 11;
    }

    stepY = metaY + 6;
  });

  // Cost & Time summary
  stepY += 10;
  ctx.strokeStyle = COLORS.panelBorder;
  ctx.beginPath();
  ctx.moveTo(rightCardX + 20, stepY);
  ctx.lineTo(rightCardX + rightCardW - 20, stepY);
  ctx.stroke();

  stepY += 14;
  drawGlowText(ctx, 'COST & TIME SUMMARY', rightCardX + 20, stepY, { font: 'bold 12px "IBM Plex Mono"', color: COLORS.info });

  // Parse summary from first 6 steps
  const parseCost = (s: string | undefined) => (s || '').match(/Cost:\s*([^.]+)\./)?.[1]?.trim() || '';
  const parseTime = (s: string | undefined) => (s || '').match(/Time:\s*([^.]+)\./)?.[1]?.trim() || '';
  const capitalMatch = parseCost(steps[1]).match(/\$(\d+)/);
  const gasMatch = parseCost(steps[1]).match(/gas.*?(\$[\d.]+)/i) || parseCost(steps[0]).match(/gas.*?(\$[\d.]+)/i);

  // Get hold period from step 6 (index 5) - more robust parsing
  let holdPeriod = 'n/a';
  const step6 = steps[5] || '';
  const timeMatch6 = step6.match(/Time:\s*([^.]+)\./);
  if (timeMatch6) holdPeriod = timeMatch6[1].trim();
  else {
    // Fallback: look for "Hold for at least X days"
    const holdMatch = step6.match(/Hold for at least (\d+)\s*days/i);
    if (holdMatch) holdPeriod = `${holdMatch[1]} days`;
  }

  // Per-chain gas estimates from model.ts - limit to first 4 chains
  const gasPerChain = {
    ethereum: 5.0, arbitrum: 1.5, optimism: 2.0, base: 0.8,
    polygon: 0.5, solana: 0.05, avalanche: 0.6, bsc: 0.3,
    fantom: 0.4, gnosis: 0.2, linea: 0.7, mantle: 0.6,
    scroll: 0.5, zksync: 0.8, default: 2.0
  };
  const protocolChains = topRow.chains.slice(0, 4).map(c => c.toLowerCase());
  const chainGasEstimates = protocolChains.map(c => {
    let gas = gasPerChain.default;
    for (const [key, val] of Object.entries(gasPerChain)) {
      if (c.includes(key)) { gas = val; break; }
    }
    const gasStr = gas.toFixed(1).replace(/\.0$/, '');
    return `${c}: $${gasStr}`;
  }).join(', ');

  // Total gas estimate based on main chain
  const mainChain = topRow.chains[0]?.toLowerCase() || 'base';
  let mainGas = gasPerChain.default;
  for (const [key, val] of Object.entries(gasPerChain)) {
    if (mainChain.includes(key)) { mainGas = val; break; }
  }
  const mainGasStr = mainGas.toFixed(1).replace(/\.0$/, '');
  const holdDays = parseInt(holdPeriod.match(/(\d+)/)?.[1] || '60');
  const weeks = Math.ceil(holdDays / 7);
  const totalGasEst = mainGas * (4 + weeks + 2); // setup + weekly + votes
  const totalGasStr = totalGasEst.toFixed(0);

  const summary = [
    capitalMatch ? `Total Capital: $${capitalMatch[1]}` : `Total Capital: ${parseCost(steps[1]) || parseCost(steps[0]) || 'n/a'}`,
    gasMatch ? `Initial Gas: ${gasMatch[1]}` : `Total Gas Estimate: ~$${totalGasStr} on ${topRow.chains[0] || 'main chain'} over hold period`,
    `Hold Period: ${holdPeriod}`,
    parseTime(steps[2]) ? `Weekly Commitment: ${parseTime(steps[2])}` : 'Weekly Commitment: n/a',
    `Per-chain Gas: ${chainGasEstimates}`,
  ];

  summary.forEach((s, i) => {
    drawText(ctx, `• ${s}`, rightCardX + 30, stepY + 20 + i * 16, { font: '10px "IBM Plex Mono"', color: COLORS.textDim });
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
    ['Est. ROI/$1k', fmtUsd(row2.est_net_roi_per_1k), fmtUsd(row3.est_net_roi_per_1k)],
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

  return savePng(ctx, canvas, '02-protocol-detail.png');
}

async function generateFilteredView() {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');
  const radar = loadRadarData();

  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  drawGrid(ctx);

  const acct = radar.protocol_accounting || {};

  let y = 50;
  drawGlowText(ctx, 'TOKEN RADAR v4 — FILTERED VIEW: CATEGORY & GROWTH', 60, y, {
    font: 'bold 22px "IBM Plex Mono"',
    color: COLORS.accent,
    glowColor: COLORS.accentGlow
  });
  drawText(ctx, 'Pre-token board filtered by category and 7d growth — explicit separation from already-traded per Criterion #2', 60, y + 30, {
    font: '12px "IBM Plex Mono"',
    color: COLORS.textDim
  });

  const leftPanelW = 665;
  const gap = 30;
  const startY = y + 70;

  // LEFT PANEL: High-momentum pre-token opportunities (>20% 7d growth)
  ctx.fillStyle = COLORS.panel;
  drawRoundedRect(ctx, 40, startY, leftPanelW, 600, 12);
  ctx.fill();
  ctx.strokeStyle = COLORS.panelBorder;
  ctx.stroke();

  drawText(ctx, 'HIGH-MOMENTUM PRE-TOKEN OPPORTUNITIES (>20% 7d GROWTH)', 60, startY + 18, { font: 'bold 13px "IBM Plex Mono"', color: COLORS.text });

  // Get pre-token rows with >20% growth, sorted by implied_value desc
  const growthRows = radar.rows.filter(r => r.change_7d !== null && r.change_7d > 20).slice(0, 12);

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

  growthRows.forEach((row, i) => {
    const ry = startY + 66 + i * 34;
    const tier = tierColor(row.tge_stage || 'Late-Stage (>365d)');
    const growth = row.change_7d === null ? 'n/a' : fmtPct(row.change_7d);

    ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.015)' : COLORS.bg;
    ctx.fillRect(60, ry, leftPanelW - 40, 30);

    drawText(ctx, String(row.rank), 56, ry + 8, { font: 'bold 12px "IBM Plex Mono"', color: tier.color });
    drawText(ctx, truncateToWidth(ctx, row.name, 135, '12px "IBM Plex Mono"'), 88, ry + 8, { font: '12px "IBM Plex Mono"', color: COLORS.text });
    drawText(ctx, fmtUsd(row.tvl_usd), 232, ry + 8, { font: '12px "IBM Plex Mono"', color: COLORS.text });
    drawText(ctx, growth, 302, ry + 8, { font: '12px "IBM Plex Mono"', color: (row.change_7d || 0) >= 0 ? COLORS.positive : COLORS.negative });
    drawText(ctx, truncateToWidth(ctx, row.tge_stage || 'Late-Stage (>365d)', 150, '11px "IBM Plex Mono"'), 386, ry + 8, { font: 'bold 11px "IBM Plex Mono"', color: tier.color });
    drawText(ctx, fmtUsd(row.implied_value_usd), 550, ry + 8, { font: 'bold 12px "IBM Plex Mono"', color: COLORS.accent });
  });

  drawText(ctx, `High-momentum cohort: ${growthRows.length} protocols with >20% 7d TVL growth`, 60, startY + 500, { font: '11px "IBM Plex Mono"', color: COLORS.textMuted });
  drawText(ctx, 'Ranked by implied_value_usd descending. Filter: change_7d > 20%.', 60, startY + 518, { font: '11px "IBM Plex Mono"', color: COLORS.textMuted });

  // RIGHT PANEL: Category filter — Lending & DEX (top categories by count)
  const rightPanelX = 40 + leftPanelW + gap;
  const rightPanelW = WIDTH - 80 - leftPanelW - gap;

  ctx.fillStyle = COLORS.panel;
  drawRoundedRect(ctx, rightPanelX, startY, rightPanelW, 600, 12);
  ctx.fill();
  ctx.strokeStyle = COLORS.panelBorder;
  ctx.stroke();

  drawText(ctx, 'CATEGORY FILTER: LENDING & DEX (TOP CATEGORIES)', rightPanelX + 20, startY + 18, { font: 'bold 13px "IBM Plex Mono"', color: COLORS.text });
  drawText(ctx, 'Pre-token protocols in lending/CDP/collateral and DEX/AMM/yield categories.', rightPanelX + 20, startY + 36, { font: '11px "IBM Plex Mono"', color: COLORS.textMuted });

  const catHeaders = [
    { title: 'PROTOCOL', x: rightPanelX + 20, w: 200 },
    { title: 'TVL', x: rightPanelX + 240, w: 110 },
    { title: '7d %', x: rightPanelX + 370, w: 70 },
    { title: 'TGE STAGE', x: rightPanelX + 460, w: 130 },
    { title: 'IMPLIED', x: rightPanelX + 610, w: 100 },
  ];
  catHeaders.forEach(h => {
    drawText(ctx, h.title, h.x, startY + 70, { font: 'bold 10px "IBM Plex Mono"', color: COLORS.textDim, align: 'left', baseline: 'middle' });
  });

  const catRows = radar.rows.filter(r => {
    const c = (r.category || '').toLowerCase();
    return c.includes('lend') || c.includes('cdp') || c.includes('collateral') ||
           c.includes('dex') || c.includes('amm') || c.includes('yield');
  }).slice(0, 10);

  catRows.forEach((r, i) => {
    const ry = startY + 92 + i * 28;
    ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.015)' : COLORS.bg;
    ctx.fillRect(rightPanelX + 20, ry, rightPanelW - 40, 24);

    const tier = tierColor(r.tge_stage || 'Late-Stage (>365d)');
    drawText(ctx, r.name, rightPanelX + 20, ry + 6, { font: '12px "IBM Plex Mono"', color: COLORS.text });
    drawText(ctx, fmtUsd(r.tvl_usd), rightPanelX + 240, ry + 6, { font: '12px "IBM Plex Mono"', color: COLORS.text });
    drawText(ctx, r.change_7d === null ? 'n/a' : fmtPct(r.change_7d), rightPanelX + 370, ry + 6, { font: '12px "IBM Plex Mono"', color: (r.change_7d || 0) >= 0 ? COLORS.positive : COLORS.negative });
    drawText(ctx, truncateToWidth(ctx, r.tge_stage || 'Late-Stage (>365d)', 125, '11px "IBM Plex Mono"'), rightPanelX + 460, ry + 6, { font: 'bold 11px "IBM Plex Mono"', color: tier.color });
    drawText(ctx, fmtUsd(r.implied_value_usd), rightPanelX + 610, ry + 6, { font: 'bold 12px "IBM Plex Mono"', color: COLORS.accent });
  });

  drawText(ctx, `Category-filtered: ${catRows.length} lending/DEX protocols. Already-traded cohort (${acct.already_traded ?? radar.live.length}) separated.`, rightPanelX + 20, startY + 380, { font: '11px "IBM Plex Mono"', color: COLORS.textMuted });
  drawText(ctx, 'Pre-token gate: mcap_usd === null && gecko_id === null && symbol === null.', rightPanelX + 20, startY + 398, { font: '11px "IBM Plex Mono"', color: COLORS.textMuted });

  // Bottom: Already-traded benchmark cohort
  const bottomY = startY + 440;
  ctx.fillStyle = COLORS.panel;
  drawRoundedRect(ctx, 40, bottomY, WIDTH - 80, 180, 12);
  ctx.fill();
  ctx.strokeStyle = COLORS.panelBorder;
  ctx.stroke();

  drawText(ctx, 'ALREADY-TRADED BENCHMARK COHORT (SEPARATED)', 60, bottomY + 18, { font: 'bold 13px "IBM Plex Mono"', color: COLORS.text });

  const liveHeaders = [
    { title: 'PROTOCOL', x: 60, w: 160 },
    { title: 'TVL', x: 240, w: 110 },
    { title: 'MCAP', x: 370, w: 120 },
    { title: '7d %', x: 510, w: 70 },
    { title: 'IMPLIED (model)', x: 600, w: 140 },
    { title: 'MCAP/IMPLIED', x: 760, w: 120 },
    { title: 'MODEL MULT', x: 900, w: 100 },
  ];
  liveHeaders.forEach(h => {
    drawText(ctx, h.title, h.x, bottomY + 44, { font: 'bold 10px "IBM Plex Mono"', color: COLORS.textDim, align: 'left', baseline: 'middle' });
  });

  radar.live.slice(0, 5).forEach((r, i) => {
    const ry = bottomY + 66 + i * 24;
    ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.015)' : COLORS.bg;
    ctx.fillRect(60, ry, WIDTH - 120, 22);

    const implied = Math.max(1, Math.round(r.tvl_usd * radar.model.base_multiple * 1.5));
    const ratio = r.mcap_usd && implied > 0 ? (r.mcap_usd / implied).toFixed(2) + 'x' : '—';
    const modelMult = r.tvl_usd > 0 ? (implied / r.tvl_usd).toFixed(2) + 'x' : '—';

    drawText(ctx, r.name, 60, ry + 4, { font: '12px "IBM Plex Mono"', color: COLORS.text });
    drawText(ctx, fmtUsd(r.tvl_usd), 240, ry + 4, { font: '12px "IBM Plex Mono"', color: COLORS.text });
    drawText(ctx, r.mcap_usd !== null && r.mcap_usd !== undefined ? fmtUsd(r.mcap_usd) : '—', 370, ry + 4, { font: '12px "IBM Plex Mono"', color: COLORS.textDim });
    drawText(ctx, r.change_7d === null ? '—' : fmtPct(r.change_7d), 510, ry + 4, { font: '12px "IBM Plex Mono"', color: (r.change_7d || 0) >= 0 ? COLORS.positive : COLORS.negative });
    drawText(ctx, fmtUsd(implied), 600, ry + 4, { font: '12px "IBM Plex Mono"', color: COLORS.accent });
    drawText(ctx, ratio, 760, ry + 4, { font: '12px "IBM Plex Mono"', color: COLORS.efficiency });
    drawText(ctx, modelMult, 900, ry + 4, { font: 'bold 12px "IBM Plex Mono"', color: COLORS.info });
  });

  return savePng(ctx, canvas, '03-filtered-view.png');
}

async function main() {
  console.log('Generating Token Radar v4 publication-grade screenshots...');
  await generateBoard();
  await generateProtocolDetail();
  await generateFilteredView();
  console.log('All 3 screenshots generated successfully!');
}

main().catch(err => {
  console.error('Screenshot generation failed:', err);
  process.exit(1);
});