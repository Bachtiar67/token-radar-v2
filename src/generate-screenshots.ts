// Token Radar v2 - Screenshot Generator v2
// Uses @napi-rs/canvas with embedded fonts for deterministic PNG generation
// Three publication-grade dark-mode financial terminal screenshots

import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const projectRoot = join(here, '..');
const outputDir = join(projectRoot, 'output');
const screenshotsDir = join(projectRoot, 'screenshots');
const assetsDir = join(projectRoot, 'assets');

const WIDTH = 1440;
const HEIGHT = 900;

GlobalFonts.registerFromPath(join(assetsDir, 'fonts', 'IBMPlexMono-Regular.ttf'), 'IBM Plex Mono');
GlobalFonts.registerFromPath(join(assetsDir, 'fonts', 'IBMPlexMono-Regular.ttf'), 'IBM Plex Mono Bold');

const COLORS = {
  bg: '#0a0e14',
  panel: '#111820',
  panelBorder: '#1e2a3a',
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
  grid: '#1e2a3a',
  barBg: '#0d141c',
  positive: '#00d4aa',
  negative: '#ff5252',
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

function riskTier(score: number): { label: string; color: string; glow: string } {
  if (score >= 0.63) return { label: 'LOW', color: COLORS.positive, glow: COLORS.accentGlow };
  if (score >= 0.5) return { label: 'MEDIUM', color: COLORS.warn, glow: COLORS.warnGlow };
  if (score >= 0.25) return { label: 'HIGH', color: COLORS.danger, glow: COLORS.dangerGlow };
  return { label: 'CRITICAL', color: '#ff0000', glow: 'rgba(255, 0, 0, 0.4)' };
}

// Draw diagonal hatch pattern for color-blind accessibility
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

function loadRadarData() {
  const envOut = process.env.MAKEFUN_OUTPUT_DIR;
  const candidatePaths = [
    envOut ? join(envOut, 'data.js') : null,
    join(projectRoot, 'output', 'data.js'),
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

// Truncate text to a pixel width, appending an ASCII "..." ellipsis.
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

// Wrap text into lines that fit maxWidth at the given font. Returns lines.
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

// Enrich radar rows with their structured analysis and rank by composite score.
interface EnrichedRow {
  row: any;
  composite: number;
  analysis: any;
}

function rankedRows(radar: any): EnrichedRow[] {
  const analyses = radar.token_analyses || {};
  const enriched: EnrichedRow[] = radar.rows.map((row: any) => {
    const analysis = analyses[row.slug];
    let composite: number;
    if (analysis && typeof analysis.composite_score === 'number') {
      composite = analysis.composite_score;
    } else {
      composite = Math.round(((row.liquidity_score || 0) + (row.holder_score || 0) + (row.momentum_score || 0)) * 100 / 3);
    }
    return { row, composite, analysis };
  });
  enriched.sort((a, b) =>
    b.composite - a.composite ||
    (b.row.tvl_usd || 0) - (a.row.tvl_usd || 0) ||
    (b.row.liquidity_score || 0) - (a.row.liquidity_score || 0) ||
    (a.row.slug < b.row.slug ? -1 : a.row.slug > b.row.slug ? 1 : 0)
  );
  // Assign display ranks by composite order (1 = highest composite score).
  enriched.forEach((e, i) => {
    e.row = { ...e.row, rank: i + 1 };
  });
  return enriched;
}

async function generateMarketOverview() {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');
  const radar = loadRadarData();

  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

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

  const topRows = rankedRows(radar).map(e => e.row).slice(0, 10);
  const analyses = radar.token_analyses || {};
  const passCount = Math.max(0, radar.rows.filter(r => {
    const a = analyses[r.slug];
    return a && typeof a.composite_score === 'number' ? a.composite_score >= 63 : false;
  }).length);
  const watchCount = Math.max(0, radar.rows.filter(r => {
    const a = analyses[r.slug];
    return a && typeof a.composite_score === 'number' ? a.composite_score >= 50 && a.composite_score < 63 : false;
  }).length);
  const rejectCount = Math.max(0, radar.rows.length - passCount - watchCount);
  const medianLiq = radar.rows.map(r => r.liquidity_score || 0).sort((a, b) => a - b)[Math.floor(radar.rows.length / 2)];

  let y = 50;
  drawGlowText(ctx, 'TOKEN RADAR v2 — MARKET OVERVIEW', 60, y, {
    font: 'bold 24px "IBM Plex Mono"',
    color: COLORS.accent,
    glowColor: COLORS.accentGlow
  });
  drawText(ctx, `Snapshot: ${radar.as_of} | ${radar.watchlist_size} Watchlist | ${radar.early_size} Early | ${radar.live_size} Live`, 60, y + 30, {
    font: '12px "IBM Plex Mono"',
    color: COLORS.textDim
  });

  const kpis = [
    { label: 'TOTAL SCANNED', value: String(radar.rows.length), color: COLORS.info, glow: COLORS.infoGlow },
    { label: 'PASS (STRONG)', value: String(passCount), color: COLORS.positive, glow: COLORS.accentGlow },
    { label: 'WATCH (CAUTION)', value: String(watchCount), color: COLORS.warn, glow: COLORS.warnGlow },
    { label: 'REJECT (HIGH RISK)', value: String(rejectCount), color: COLORS.danger, glow: COLORS.dangerGlow },
    { label: 'MEDIAN LIQUIDITY', value: Math.round(medianLiq * 100) + '%', color: COLORS.accent, glow: COLORS.accentGlow },
    { label: 'MARKET REGIME', value: passCount > radar.rows.length * 0.3 ? 'BULLISH' : passCount > radar.rows.length * 0.15 ? 'NEUTRAL' : 'BEARISH', color: passCount > radar.rows.length * 0.3 ? COLORS.positive : passCount > radar.rows.length * 0.15 ? COLORS.warn : COLORS.danger, glow: passCount > radar.rows.length * 0.3 ? COLORS.accentGlow : passCount > radar.rows.length * 0.15 ? COLORS.warnGlow : COLORS.dangerGlow },
  ];

  let kx = 60;
  const kw = 210;
  kpis.forEach((kpi, i) => {
    const px = 60 + i * (kw + 16);
    ctx.fillStyle = COLORS.panel;
    drawRoundedRect(ctx, px, y + 60, kw, 100, 12);
    ctx.fill();
    ctx.strokeStyle = COLORS.panelBorder;
    ctx.stroke();

    drawText(ctx, kpi.label, px + 16, y + 74, { font: '11px "IBM Plex Mono"', color: COLORS.textMuted });
    drawGlowText(ctx, kpi.value, px + 16, y + 94, { font: 'bold 22px "IBM Plex Mono"', color: kpi.color, glowColor: kpi.glow });
  });

  y += 180;

  ctx.fillStyle = COLORS.panel;
  drawRoundedRect(ctx, 40, y, WIDTH - 80, 400, 12);
  ctx.fill();
  ctx.strokeStyle = COLORS.panelBorder;
  ctx.stroke();

  drawText(ctx, 'TOP RANKED TOKENS', 60, y + 20, { font: 'bold 14px "IBM Plex Mono"', color: COLORS.text });

  const colHeaders = [
    { title: 'RANK', x: 60, w: 70 },
    { title: 'TOKEN', x: 150, w: 280 },
    { title: 'TVL', x: 450, w: 150 },
    { title: '7D %', x: 620, w: 100 },
    { title: 'LIQUIDITY', x: 740, w: 140 },
    { title: 'HOLDERS', x: 900, w: 140 },
    { title: 'MOMENTUM', x: 1060, w: 140 },
    { title: 'IMPLIED VALUE', x: 1220, w: 180 },
  ];

  ctx.fillStyle = COLORS.panelBorder;
  ctx.fillRect(60, y + 40, WIDTH - 120, 32);
  colHeaders.forEach(col => {
    drawText(ctx, col.title, col.x, y + 56, { font: 'bold 11px "IBM Plex Mono"', color: COLORS.textDim, align: 'left', baseline: 'middle' });
  });

  topRows.forEach((row, i) => {
    const ry = y + 80 + i * 30;
    if (i % 2 === 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.02)';
      ctx.fillRect(60, ry, WIDTH - 120, 28);
    }

    const liqPct = Math.round((row.liquidity_score || 0) * 100);
    const holdPct = Math.round((row.holder_score || 0) * 100);
    const momPct = Math.round((row.momentum_score || 0) * 100);
    const liqTier = riskTier(row.liquidity_score || 0);
    const holdTier = riskTier(row.holder_score || 0);
    const momTier = riskTier(row.momentum_score || 0);

    drawText(ctx, '#' + row.rank, 60, ry + 14, { font: 'bold 13px "IBM Plex Mono"', color: COLORS.accent, baseline: 'middle' });
    drawText(ctx, row.name, 150, ry + 14, { font: '13px "IBM Plex Mono"', color: COLORS.text, baseline: 'middle' });
    drawText(ctx, fmtUsd(row.tvl_usd), 450, ry + 14, { font: '13px "IBM Plex Mono"', color: COLORS.text, baseline: 'middle' });

    const growth = row.change_7d === null ? 'n/a' : fmtPct(row.change_7d);
    const growthColor = row.change_7d === null ? COLORS.textMuted : row.change_7d >= 0 ? COLORS.positive : COLORS.negative;
    drawText(ctx, growth, 620, ry + 14, { font: '13px "IBM Plex Mono"', color: growthColor, baseline: 'middle' });

    drawText(ctx, liqPct + '%', 740, ry + 14, { font: '13px "IBM Plex Mono"', color: liqTier.color, baseline: 'middle' });
    drawText(ctx, holdPct + '%', 900, ry + 14, { font: '13px "IBM Plex Mono"', color: holdTier.color, baseline: 'middle' });
    drawText(ctx, momPct + '%', 1060, ry + 14, { font: '13px "IBM Plex Mono"', color: momTier.color, baseline: 'middle' });

    drawText(ctx, fmtUsd(row.implied_value_usd), 1220, ry + 14, { font: 'bold 13px "IBM Plex Mono"', color: COLORS.accent, baseline: 'middle' });
  });

  y += 380;

  ctx.fillStyle = COLORS.panel;
  drawRoundedRect(ctx, 40, y, WIDTH - 80, 220, 12);
  ctx.fill();
  ctx.strokeStyle = COLORS.panelBorder;
  ctx.stroke();

  drawText(ctx, 'RISK TIER DISTRIBUTION', 60, y + 20, { font: 'bold 14px "IBM Plex Mono"', color: COLORS.text });

  const tierOf = (r: any): string => {
    const a = analyses[r.slug];
    return a && typeof a.risk_tier === 'string' ? a.risk_tier : 'CRITICAL';
  };
  const tiers = [
    { label: 'LOW', color: COLORS.positive, count: radar.rows.filter(r => tierOf(r) === 'LOW').length },
    { label: 'MEDIUM', color: COLORS.warn, count: radar.rows.filter(r => tierOf(r) === 'MEDIUM').length },
    { label: 'HIGH', color: COLORS.danger, count: radar.rows.filter(r => tierOf(r) === 'HIGH').length },
    { label: 'CRITICAL', color: '#ff0000', count: radar.rows.filter(r => tierOf(r) === 'CRITICAL').length },
  ];

  const totalTokens = radar.rows.length;
  const trackStartX = 180;
  const trackEndX = WIDTH - 180;
  const trackWidth = trackEndX - trackStartX;

  tiers.forEach((tier, i) => {
    const ty = y + 50 + i * 40;
    const barWidth = tier.count > 0 ? Math.round((tier.count / totalTokens) * trackWidth) : 0;

    drawText(ctx, tier.label, 60, ty + 12, { font: 'bold 13px "IBM Plex Mono"', color: tier.color, baseline: 'middle' });

    // Draw track background (full width)
    ctx.fillStyle = tier.color + '20';
    drawRoundedRect(ctx, trackStartX, ty, trackWidth, 24, 6);
    ctx.fill();

    // Draw filled bar only if count > 0 (avoids zero-count sliver artifact)
    if (tier.count > 0) {
      ctx.fillStyle = tier.color;
      drawRoundedRect(ctx, trackStartX, ty, barWidth, 24, 6);
      ctx.fill();
      // Add hatch for color-blind accessibility
      drawHatch(ctx, trackStartX, ty, barWidth, 24, 'rgba(0,0,0,0.25)', 6);
    }

    drawText(ctx, String(tier.count) + ' tokens', trackEndX + 10, ty + 12, { font: '13px "IBM Plex Mono"', color: COLORS.textDim, baseline: 'middle' });
  });

  const outputPath = join(screenshotsDir, '01-market-overview.png');
  mkdirSync(screenshotsDir, { recursive: true });
  writeFileSync(outputPath, canvas.toBuffer('image/png'));
  console.log(`Generated: ${outputPath}`);
  return outputPath;
}

async function generateRiskLiquidityMatrix() {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');
  const radar = loadRadarData();

  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

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

  let y = 50;
  drawGlowText(ctx, 'TOKEN RADAR v2 — RISK & LIQUIDITY MATRIX', 60, y, {
    font: 'bold 24px "IBM Plex Mono"',
    color: COLORS.accent,
    glowColor: COLORS.accentGlow
  });
  drawText(ctx, `Liquidity-to-MCap Health | Holder Concentration | Volume Anomaly Flags`, 60, y + 30, {
    font: '12px "IBM Plex Mono"',
    color: COLORS.textDim
  });

  y += 100;

  const leftPanelW = 680;
  const gap = 20;

  ctx.fillStyle = COLORS.panel;
  drawRoundedRect(ctx, 40, y, leftPanelW, 380, 12);
  ctx.fill();
  ctx.strokeStyle = COLORS.panelBorder;
  ctx.stroke();

  drawText(ctx, 'LIQUIDITY DEPTH vs IMPLIED VALUE', 60, y + 20, { font: 'bold 14px "IBM Plex Mono"', color: COLORS.text });

  const scatterData = radar.rows.slice(0, 30).map(r => ({
    x: (r.liquidity_score || 0) * 100,
    y: r.implied_value_usd,
    name: r.name,
    color: riskTier(r.liquidity_score || 0).color
  }));

  const maxX = 100;
  const maxY = Math.max(...scatterData.map(d => d.y)) * 1.1;
  const plotX = 80;
  const plotY = y + 50;
  const plotW = 600;
  const plotH = 300;

  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = 1;
  for (let i = 0; i <= 5; i++) {
    const gx = plotX + (i / 5) * plotW;
    ctx.beginPath();
    ctx.moveTo(gx, plotY);
    ctx.lineTo(gx, plotY + plotH);
    ctx.stroke();
    drawText(ctx, Math.round(i * 20) + '%', gx, plotY + plotH + 18, { font: '10px "IBM Plex Mono"', color: COLORS.textMuted, align: 'center' });
  }
  for (let i = 0; i <= 5; i++) {
    const gy = plotY + (i / 5) * plotH;
    ctx.beginPath();
    ctx.moveTo(plotX, gy);
    ctx.lineTo(plotX + plotW, gy);
    ctx.stroke();
    drawText(ctx, fmtUsd(maxY * (1 - i / 5)), plotX - 10, gy + 4, { font: '10px "IBM Plex Mono"', color: COLORS.textMuted, align: 'right' });
  }

  scatterData.forEach(d => {
    const px = plotX + (d.x / maxX) * plotW;
    const py = plotY + plotH - (d.y / maxY) * plotH;
    ctx.fillStyle = d.color;
    ctx.beginPath();
    ctx.arc(px, py, 6, 0, Math.PI * 2);
    ctx.fill();
  });

  // PASS threshold line at 63% liquidity
  const thresholdX = plotX + (63 / maxX) * plotW;
  ctx.strokeStyle = COLORS.positive;
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 4]);
  ctx.beginPath();
  ctx.moveTo(thresholdX, plotY);
  ctx.lineTo(thresholdX, plotY + plotH);
  ctx.stroke();
  ctx.setLineDash([]);
  drawText(ctx, 'PASS ≥63%', thresholdX + 4, plotY + 16, { font: 'bold 10px "IBM Plex Mono"', color: COLORS.positive });

  // Highlight #1 Gauntlet
  const gauntlet = scatterData.find(d => d.name.toLowerCase().includes('gauntlet'));
  if (gauntlet) {
    const gx = plotX + (gauntlet.x / maxX) * plotW;
    const gy = plotY + plotH - (gauntlet.y / maxY) * plotH;
    ctx.strokeStyle = COLORS.accent;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(gx, gy, 10, 0, Math.PI * 2);
    ctx.stroke();
    drawText(ctx, '#1 ' + gauntlet.name, gx + 14, gy - 10, { font: 'bold 11px "IBM Plex Mono"', color: COLORS.accent });
  }

  y += 400;

  const rightPanelX = 40 + leftPanelW + gap;
  const rightPanelW = WIDTH - 80 - leftPanelW - gap;

  ctx.fillStyle = COLORS.panel;
  drawRoundedRect(ctx, rightPanelX, y - 400, rightPanelW, 380, 12);
  ctx.fill();
  ctx.strokeStyle = COLORS.panelBorder;
  ctx.stroke();

  drawText(ctx, 'HOLDER CONCENTRATION / WHALE RISK', rightPanelX + 20, y - 380, { font: 'bold 14px "IBM Plex Mono"', color: COLORS.text });

  const gaugeData = radar.rows.slice(0, 8).map(r => ({
    name: r.name.length > 18 ? r.name.slice(0, 18) + '…' : r.name,
    score: r.holder_score || 0,
    color: riskTier(r.holder_score || 0).color
  }));

  gaugeData.forEach((g, i) => {
    const gy = y - 360 + i * 45;
    const barW = Math.round(g.score * 300);
    drawText(ctx, g.name, rightPanelX + 20, gy + 10, { font: '12px "IBM Plex Mono"', color: COLORS.text });
    ctx.fillStyle = COLORS.barBg;
    drawRoundedRect(ctx, rightPanelX + 20, gy + 24, 300, 16, 8);
    ctx.fill();
    ctx.fillStyle = g.color;
    drawRoundedRect(ctx, rightPanelX + 20, gy + 24, barW, 16, 8);
    ctx.fill();
    // Add hatch for color-blind accessibility
    drawHatch(ctx, rightPanelX + 20, gy + 24, barW, 16, 'rgba(0,0,0,0.3)', 6);
    drawText(ctx, Math.round(g.score * 100) + '%', rightPanelX + 340, gy + 10, { font: 'bold 12px "IBM Plex Mono"', color: g.color });
  });

  y += 20;

  ctx.fillStyle = COLORS.panel;
  drawRoundedRect(ctx, 40, y, leftPanelW, 380, 12);
  ctx.fill();
  ctx.strokeStyle = COLORS.panelBorder;
  ctx.stroke();

  drawText(ctx, 'ORGANIC VOLUME vs ANOMALY FLAGS', 60, y + 20, { font: 'bold 14px "IBM Plex Mono"', color: COLORS.text });

  const volData = radar.rows.slice(0, 30).map(r => ({
    momentum: r.momentum_score || 0,
    growth: r.change_7d || 0,
    name: r.name,
    color: riskTier(r.momentum_score || 0).color
  }));

  const volMaxX = 100;
  const volMinY = -50;
  const volMaxY = 150;
  const volPlotX = 80;
  const volPlotY = y + 50;
  const volPlotW = 600;
  const volPlotH = 300;

  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = 1;
  for (let i = 0; i <= 5; i++) {
    const gx = volPlotX + (i / 5) * volPlotW;
    ctx.beginPath();
    ctx.moveTo(gx, volPlotY);
    ctx.lineTo(gx, volPlotY + volPlotH);
    ctx.stroke();
    drawText(ctx, Math.round(i * 20) + '%', gx, volPlotY + volPlotH + 18, { font: '10px "IBM Plex Mono"', color: COLORS.textMuted, align: 'center' });
  }
  for (let i = 0; i <= 5; i++) {
    const gy = volPlotY + (i / 5) * volPlotH;
    ctx.beginPath();
    ctx.moveTo(volPlotX, gy);
    ctx.lineTo(volPlotX + volPlotW, gy);
    ctx.stroke();
    const val = volMinY + (1 - i / 5) * (volMaxY - volMinY);
    drawText(ctx, val >= 0 ? '+' + Math.round(val) + '%' : Math.round(val) + '%', volPlotX - 10, gy + 4, { font: '10px "IBM Plex Mono"', color: COLORS.textMuted, align: 'right' });
  }

  volData.forEach(d => {
    const px = volPlotX + (d.momentum / 1) * volPlotW;
    const py = volPlotY + volPlotH - ((d.growth - volMinY) / (volMaxY - volMinY)) * volPlotH;
    ctx.fillStyle = d.color;
    ctx.beginPath();
    ctx.arc(px, py, 5, 0, Math.PI * 2);
    ctx.fill();
  });

  // PASS threshold line at 50% momentum
  const momentumThresholdX = volPlotX + (50 / volMaxX) * volPlotW;
  ctx.strokeStyle = COLORS.positive;
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 4]);
  ctx.beginPath();
  ctx.moveTo(momentumThresholdX, volPlotY);
  ctx.lineTo(momentumThresholdX, volPlotY + volPlotH);
  ctx.stroke();
  ctx.setLineDash([]);
  drawText(ctx, 'PASS ≥50%', momentumThresholdX + 4, volPlotY + 16, { font: 'bold 10px "IBM Plex Mono"', color: COLORS.positive });

  ctx.fillStyle = COLORS.panel;
  drawRoundedRect(ctx, rightPanelX, y, rightPanelW, 380, 12);
  ctx.fill();
  ctx.strokeStyle = COLORS.panelBorder;
  ctx.stroke();

  drawText(ctx, 'ANOMALY DETECTION SUMMARY', rightPanelX + 20, y + 20, { font: 'bold 14px "IBM Plex Mono"', color: COLORS.text });

  const anomalies = radar.rows.slice(0, 8).map(r => ({
    name: r.name,
    flags: r.risk_flags || [],
    risk: riskTier(r.liquidity_score || 0).label
  }));

  anomalies.forEach((a, i) => {
    const ay = y + 50 + i * 44;
    const nameText = truncateToWidth(ctx, a.name, 260, '12px "IBM Plex Mono"');
    drawText(ctx, nameText, rightPanelX + 20, ay + 10, { font: '12px "IBM Plex Mono"', color: COLORS.text });
    if (a.flags.length > 0) {
      a.flags.slice(0, 2).forEach((f, fi) => {
        drawText(ctx, '- ' + f, rightPanelX + 20, ay + 24 + fi * 14, { font: '10px "IBM Plex Mono"', color: COLORS.warn });
      });
    }
    const tier = riskTier(0.25);
    drawText(ctx, a.risk, rightPanelX + 400, ay + 10, { font: 'bold 12px "IBM Plex Mono"', color: riskTier(a.risk === 'LOW' ? 0.8 : a.risk === 'MEDIUM' ? 0.6 : a.risk === 'HIGH' ? 0.3 : 0.1).color });
  });

  const outputPath = join(screenshotsDir, '02-risk-liquidity-matrix.png');
  writeFileSync(outputPath, canvas.toBuffer('image/png'));
  console.log(`Generated: ${outputPath}`);
  return outputPath;
}

async function generateTopCandidatesDeepDive() {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');
  const radar = loadRadarData();

  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

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

  const top3 = rankedRows(radar).map(e => e.row).slice(0, 3);

  let y = 50;
  drawGlowText(ctx, 'TOKEN RADAR v2 — TOP CANDIDATES DEEP DIVE', 60, y, {
    font: 'bold 24px "IBM Plex Mono"',
    color: COLORS.accent,
    glowColor: COLORS.accentGlow
  });
  drawText(ctx, `Detailed breakdown: Sub-scores | Bullish Catalysts | Red Flags | Actionable Verdicts`, 60, y + 30, {
    font: '12px "IBM Plex Mono"',
    color: COLORS.textDim
  });

  const cardW = 440;
  const cardGap = 20;
  const startX = 40;

  top3.forEach((row, idx) => {
    const cx = startX + idx * (cardW + cardGap);
    const cy = 120;

    const liqScore = Math.round((row.liquidity_score || 0) * 100);
    const holdScore = Math.round((row.holder_score || 0) * 100);
    const momScore = Math.round((row.momentum_score || 0) * 100);
    const composite = Math.round((liqScore + holdScore + momScore) / 3);
    const tier = riskTier(composite / 100);

    ctx.fillStyle = COLORS.panel;
    drawRoundedRect(ctx, cx, cy, cardW, 750, 12);
    ctx.fill();
    ctx.strokeStyle = tier.color + '60';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.lineWidth = 1;

    drawGlowText(ctx, '#' + row.rank + '  ' + row.name, cx + 20, cy + 20, {
      font: 'bold 18px "IBM Plex Mono"',
      color: tier.color,
      glowColor: tier.glow
    });
    const chainsText = truncateToWidth(ctx, 'Chains: ' + row.chains.join(', '), cardW - 40, '11px "IBM Plex Mono"');
    drawText(ctx, chainsText, cx + 20, cy + 50, { font: '11px "IBM Plex Mono"', color: COLORS.textDim });
    drawText(ctx, 'TVL: ' + fmtUsd(row.tvl_usd) + '  |  7D: ' + (row.change_7d === null ? 'n/a' : fmtPct(row.change_7d)) + '  |  Age: ' + fmtAge(row.age_days), cx + 20, cy + 70, { font: '11px "IBM Plex Mono"', color: COLORS.textDim });

    drawText(ctx, 'COMPOSITE SCORE: ' + composite + '/100', cx + 20, cy + 110, { font: 'bold 14px "IBM Plex Mono"', color: tier.color });
    drawText(ctx, 'TIER: ' + tier.label, cx + 20, cy + 135, { font: 'bold 13px "IBM Plex Mono"', color: tier.color });

    const subScores = [
      { label: 'LIQUIDITY DEPTH', score: liqScore, max: 100, color: riskTier(liqScore / 100).color },
      { label: 'HOLDER SAFETY', score: holdScore, max: 100, color: riskTier(holdScore / 100).color },
      { label: 'MOMENTUM', score: momScore, max: 100, color: riskTier(momScore / 100).color },
    ];

    let sy = cy + 180;
    drawText(ctx, 'SUB-SCORES', cx + 20, sy, { font: 'bold 12px "IBM Plex Mono"', color: COLORS.accent });
    subScores.forEach((s, si) => {
      const barY = sy + 25 + si * 30;
      drawText(ctx, s.label, cx + 20, barY, { font: '11px "IBM Plex Mono"', color: COLORS.text });
      ctx.fillStyle = COLORS.barBg;
      drawRoundedRect(ctx, cx + 20, barY + 18, 300, 14, 7);
      ctx.fill();
      ctx.fillStyle = s.color;
      const barW = (s.score / s.max) * 300;
      drawRoundedRect(ctx, cx + 20, barY + 18, barW, 14, 7);
      ctx.fill();
      // Add hatch for color-blind accessibility
      drawHatch(ctx, cx + 20, barY + 18, barW, 14, 'rgba(0,0,0,0.3)', 6);
      drawText(ctx, s.score + '%', cx + 340, barY, { font: 'bold 12px "IBM Plex Mono"', color: s.color });
    });

    sy += 130;
    drawText(ctx, 'BULLISH CATALYSTS', cx + 20, sy, { font: 'bold 12px "IBM Plex Mono"', color: COLORS.positive });
    const bullish = [
      liqScore >= 70 ? 'Strong liquidity depth' : 'Adequate liquidity',
      holdScore >= 70 ? 'Healthy holder distribution' : 'Moderate concentration',
      momScore >= 60 ? 'Positive volume momentum' : 'Neutral momentum',
      row.change_7d !== null && row.change_7d > 10 ? 'Strong 7D TVL growth' : 'Stable TVL',
      row.chains.length >= 3 ? 'Multi-chain deployment' : 'Single-chain focus',
    ].filter(Boolean).slice(0, 3);

    bullish.forEach((b, bi) => {
      drawText(ctx, '- ' + b, cx + 20, sy + 22 + bi * 18, { font: '11px "IBM Plex Mono"', color: COLORS.positive });
    });

    sy += 90;
    drawText(ctx, 'RED FLAGS', cx + 20, sy, { font: 'bold 12px "IBM Plex Mono"', color: COLORS.danger });
    const redFlags = [
      liqScore < 50 ? 'Low liquidity depth' : null,
      holdScore < 50 ? 'High holder concentration' : null,
      momScore < 40 ? 'Weak volume momentum' : null,
      row.change_7d !== null && row.change_7d < -15 ? 'TVL declining sharply' : null,
      row.chains.length === 1 && row.tvl_usd < 100_000_000 ? 'Single-chain concentration risk' : null,
    ].filter(Boolean).slice(0, 3);

    if (redFlags.length === 0) redFlags.push('No significant red flags detected');

    redFlags.forEach((r, ri) => {
      drawText(ctx, '- ' + r, cx + 20, sy + 22 + ri * 18, { font: '11px "IBM Plex Mono"', color: COLORS.danger });
    });

    sy += 90;
    drawText(ctx, 'VERDICT', cx + 20, sy, { font: 'bold 12px "IBM Plex Mono"', color: COLORS.accent });
    let verdict = '';
    if (composite >= 75) verdict = 'STRONG BUY — Excellent fundamentals across all dimensions. Prime airdrop farming candidate.';
    else if (composite >= 60) verdict = 'BUY — Solid fundamentals with minor concerns. Worth allocating farming capital.';
    else if (composite >= 40) verdict = 'CAUTION — Mixed signals. Small position only, monitor closely.';
    else verdict = 'AVOID — Significant risks outweigh potential rewards.';

    const verdictLines = wrapText(ctx, verdict, cardW - 40, '12px "IBM Plex Mono"');
    verdictLines.forEach((vl, vi) => {
      drawText(ctx, vl, cx + 20, sy + 22 + vi * 16, { font: '12px "IBM Plex Mono"', color: tier.color });
    });
  });

  const outputPath = join(screenshotsDir, '03-top-candidates-deep-dive.png');
  writeFileSync(outputPath, canvas.toBuffer('image/png'));
  console.log(`Generated: ${outputPath}`);
  return outputPath;
}

async function main() {
  console.log('Generating publication-grade screenshots...');
  await generateMarketOverview();
  await generateRiskLiquidityMatrix();
  await generateTopCandidatesDeepDive();
  console.log('All screenshots generated successfully!');
}

main().catch(err => {
  console.error('Screenshot generation failed:', err);
  process.exit(1);
});