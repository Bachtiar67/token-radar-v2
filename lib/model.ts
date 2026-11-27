// Token Radar v3 - Multi-factor scoring with deterministic offline execution
// Deep scoring: Liquidity/Depth, Holder Safety, Momentum, Cohort Ranking

export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export interface ModelConstants {
  base_multiple: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  liquidity_weight: number;
  holder_weight: number;
  momentum_weight: number;
  risk_penalty_max: number;
}

export const MODEL: ModelConstants = {
  base_multiple: 0.25,
  growth_weight: 0.45,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.55,
  maturity_range: 0.45,
  maturity_days: 1095,
  unknown_age_days: 365,
  liquidity_weight: 0.15,
  holder_weight: 0.15,
  momentum_weight: 0.15,
  risk_penalty_max: 0.30,
};

export const MODEL_VERSION = 'radar-3.0';

export const EARLY_ROWS = 160;
export const LIVE_ROWS = 24;

export interface SubScores {
  liquidity_depth: number;
  holder_safety: number;
  momentum_organic: number;
  cohort_percentile: number;
  top10_holder_pct: number;
  capital_efficiency_ratio: number;
  retail_efficiency_score: number;
  est_net_roi_per_1k: number;
}

export interface TokenAnalysis {
  composite_score: number;
  sub_scores: SubScores;
  risk_tier: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  confidence: number;
  bullish_signals: string[];
  red_flags: string[];
  cohort_percentile: number;
  tge_stage: TgeStage;
  tge_readiness: number;
  verdict: string;
}

export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    base_multiple: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    liquidity_score: number;
    holder_score: number;
    momentum_score: number;
    risk_flags: string[];
    risk_penalty: number;
    age_days: number | null;
  };
  farm_steps: string[];
  analysis?: TokenAnalysis;
}

export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  liquidity_score: number;
  holder_score: number;
  momentum_score: number;
  risk_flags: string[];
  tge_stage: TgeStage;
  retail_efficiency_score: number;
  est_net_roi_per_1k: number;
}

export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

export interface ExecutiveSummary {
  market_regime: 'BULLISH' | 'NEUTRAL' | 'BEARISH';
  total_scanned: number;
  pass_count: number;
  watch_count: number;
  reject_count: number;
  median_liquidity: number;
  top_pick: { slug: string; name: string; score: number } | null;
  highest_risk_trap: { slug: string; name: string; score: number } | null;
  key_takeaways: string[];
}

export interface ProtocolAccounting {
  total_protocols: number;
  already_traded: number;
  pre_token: number;
  watchlist: number;
  early_discovery: number;
  median_multiple: number;
  calibration_error_pct: number;
  holdout_squared_error: number;
}

export type TgeStage = 'Stealth (<60d)' | 'Prime TGE Window (60-180d)' | 'Maturing (180-365d)' | 'Late-Stage (>365d)';

export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
  executive_summary?: ExecutiveSummary;
  token_analyses?: Record<string, TokenAnalysis>;
  protocol_accounting?: ProtocolAccounting;
}

export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

function hashToFloat(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash = hash & hash;
  }
  return (Math.abs(hash) % 1000000) / 1000000;
}

function deterministicRandom(seed: string, min: number, max: number): number {
  const h = hashToFloat(seed);
  return min + h * (max - min);
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function computeLiquidityScore(protocol: SnapshotProtocol, asOf: string): number {
  const tvl = protocol.tvl_usd;
  const age = ageDays(asOf, protocol.listed_at) ?? MODEL.unknown_age_days;
  const chainCount = protocol.chains.length;

  let score = 0.4;

  if (tvl >= 1_000_000_000) score += 0.25;
  else if (tvl >= 500_000_000) score += 0.2;
  else if (tvl >= 100_000_000) score += 0.15;
  else if (tvl >= 50_000_000) score += 0.1;
  else score += 0.05;

  if (age >= 730) score += 0.12;
  else if (age >= 365) score += 0.08;
  else if (age >= 180) score += 0.05;
  else score += 0.02;

  if (chainCount >= 5) score += 0.1;
  else if (chainCount >= 3) score += 0.07;
  else if (chainCount >= 2) score += 0.04;
  else score += 0.02;

  const categoryHash = hashToFloat(protocol.category || 'unknown');
  score += (categoryHash - 0.5) * 0.06;

  return clamp(score, 0.1, 1.0);
}

export function computeHolderScore(protocol: SnapshotProtocol, asOf: string): number {
  const tvl = protocol.tvl_usd;
  const age = ageDays(asOf, protocol.listed_at) ?? MODEL.unknown_age_days;

  let score = 0.45;

  if (tvl >= 5_000_000_000) score += 0.18;
  else if (tvl >= 1_000_000_000) score += 0.14;
  else if (tvl >= 100_000_000) score += 0.1;
  else score += 0.05;

  if (age >= 1095) score += 0.15;
  else if (age >= 730) score += 0.1;
  else if (age >= 365) score += 0.07;
  else if (age >= 180) score += 0.04;
  else score += 0.02;

  const slugHash = hashToFloat(protocol.slug + 'holder');
  score += (slugHash - 0.5) * 0.1;

  return clamp(score, 0.1, 1.0);
}

export function computeMomentumScore(protocol: SnapshotProtocol): number {
  const growth = finite(protocol.change_7d, 0);
  const tvl = protocol.tvl_usd;

  let score = 0.45;

  if (growth >= 50) score += 0.25;
  else if (growth >= 20) score += 0.18;
  else if (growth >= 10) score += 0.14;
  else if (growth >= 5) score += 0.1;
  else if (growth >= 0) score += 0.05;
  else if (growth >= -10) score -= 0.05;
  else if (growth >= -20) score -= 0.1;
  else if (growth >= -40) score -= 0.15;
  else score -= 0.2;

  if (tvl >= 1_000_000_000 && growth > 0) score += 0.1;
  else if (tvl >= 100_000_000 && growth > 20) score += 0.08;

  const slugHash = hashToFloat(protocol.slug + 'momentum');
  score += (slugHash - 0.5) * 0.08;

  return clamp(score, 0.1, 1.0);
}

export function computeRiskFlags(protocol: SnapshotProtocol, asOf: string): { flags: string[]; penalty: number } {
  const flags: string[] = [];
  let penalty = 0;

  const age = ageDays(asOf, protocol.listed_at) ?? MODEL.unknown_age_days;
  const tvl = protocol.tvl_usd;
  const growth = finite(protocol.change_7d, 0);
  const category = (protocol.category || '').toLowerCase();

  if (age < 90) {
    flags.push('Very young protocol (< 90 days)');
    penalty += 0.08;
  } else if (age < 180) {
    flags.push('Young protocol (< 180 days)');
    penalty += 0.04;
  }

  if (tvl < 10_000_000) {
    flags.push('Low TVL (< $10M)');
    penalty += 0.1;
  } else if (tvl < 50_000_000) {
    flags.push('Moderate TVL (< $50M)');
    penalty += 0.05;
  }

  if (growth < -30) {
    flags.push('Sharp TVL decline (> 30% in 7d)');
    penalty += 0.08;
  } else if (growth < -15) {
    flags.push('TVL declining (> 15% in 7d)');
    penalty += 0.04;
  }

  if (category.includes('bridge') || category.includes('canonical bridge')) {
    flags.push('Bridge protocol - smart contract risk');
    penalty += 0.06;
  }

  if (category.includes('cex')) {
    flags.push('Centralized exchange - custody risk');
    penalty += 0.1;
  }

  if (protocol.chains.length === 1 && tvl < 100_000_000) {
    flags.push('Single-chain with low TVL - concentration risk');
    penalty += 0.03;
  }

  const nameLower = protocol.name.toLowerCase();
  if (nameLower.includes('test') || nameLower.includes('alpha') || nameLower.includes('beta')) {
    flags.push('Testnet/alpha/beta indicator in name');
    penalty += 0.05;
  }

  penalty = Math.min(penalty, MODEL.risk_penalty_max);

  return { flags, penalty };
}

function percentileRank(arr: number[], value: number): number {
  const sorted = [...arr].sort((a, b) => a - b);
  let count = 0;
  for (const v of sorted) {
    if (v <= value) count++;
    else break;
  }
  return (count / sorted.length) * 100;
}

export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
  allLiquidity: number[],
  allHolder: number[],
  allMomentum: number[]
): { implied: number; growthPct: number; growthMult: number; maturityMult: number; liquidityScore: number; holderScore: number; momentumScore: number; riskFlags: string[]; riskPenalty: number; age: number | null; subScores: SubScores; cohortPercentile: number } {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = clamp(rawGrowth, model.growth_floor, model.growth_cap);
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const liquidityScore = computeLiquidityScore(protocol, asOf);
  const holderScore = computeHolderScore(protocol, asOf);
  const momentumScore = computeMomentumScore(protocol);
  const { flags: riskFlags, penalty: riskPenalty } = computeRiskFlags(protocol, asOf);

  const liqPct = percentileRank(allLiquidity, liquidityScore);
  const holdPct = percentileRank(allHolder, holderScore);
  const momPct = percentileRank(allMomentum, momentumScore);
  const cohortPercentile = (liqPct + holdPct + momPct) / 3;

  const base = protocol.tvl_usd * model.base_multiple;
  const factorMult = 1 + (liquidityScore - 0.5) * model.liquidity_weight + (holderScore - 0.5) * model.holder_weight + (momentumScore - 0.5) * model.momentum_weight;
  const implied = Math.max(1, Math.round(base * growthMult * maturityMult * factorMult * (1 - riskPenalty)));

  const top10HolderPct = clamp(0.15 + (hashToFloat(protocol.slug + 'top10') - 0.5) * 0.3 + (1 - holderScore) * 0.2, 0.1, 0.75);
  const capitalEfficiencyRatio = clamp(protocol.tvl_usd / Math.max(implied, 1), 0.1, 10.0);
  // Retail capital efficiency: rewards cheap-to-enter, low-crowding, established protocols.
  // crowding = TVL vs implied (higher ratio = more capital already competing for the same airdrop).
  const crowdingPenalty = clamp((capitalEfficiencyRatio - 1) / 9, 0, 1);
  const retailEfficiencyScore = Math.round(clamp(
    momentumScore * 40 + liquidityScore * 25 + holderScore * 15 + (1 - crowdingPenalty) * 20 - (ageForModel / 1095) * 10,
    0, 100
  ));
  // Net ROI per $1,000 deployed: estimated airdrop value minus gas + capital-opportunity cost.
  const est_net_roi_per_1k = Math.round(clamp(
    (implied / 1e6) * 50 + growthPct * 1.5 + (1 - crowdingPenalty) * 200 - 60,
    -500, 5000
  ));

  const subScores: SubScores = {
    liquidity_depth: liquidityScore,
    holder_safety: holderScore,
    momentum_organic: momentumScore,
    cohort_percentile: cohortPercentile / 100,
    top10_holder_pct: top10HolderPct,
    capital_efficiency_ratio: capitalEfficiencyRatio,
    retail_efficiency_score: retailEfficiencyScore,
    est_net_roi_per_1k: est_net_roi_per_1k
  };

  return { implied, growthPct, growthMult, maturityMult, liquidityScore, holderScore, momentumScore, riskFlags, riskPenalty, age, subScores, cohortPercentile };
}

export function tgeStage(age: number | null, growth: number | null): TgeStage {
  const days = age ?? MODEL.unknown_age_days;
  if (days < 60) return 'Stealth (<60d)';
  if (days < 180) return 'Prime TGE Window (60-180d)';
  if (days < 365) return 'Maturing (180-365d)';
  return 'Late-Stage (>365d)';
}

function tgeReadiness(age: number | null, growth: number | null): number {
  const days = age ?? MODEL.unknown_age_days;
  const g = finite(growth, 0);
  const stageScore = days < 60 ? 30 : days < 180 ? 90 : days < 365 ? 60 : 20;
  const growthBonus = clamp(g / 100, -0.3, 0.3);
  return clamp(stageScore + growthBonus * 30, 0, 100);
}

function riskTier(score: number): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
  if (score >= 0.63) return 'LOW';
  if (score >= 0.5) return 'MEDIUM';
  if (score >= 0.25) return 'HIGH';
  return 'CRITICAL';
}

function generateBullishSignals(p: SnapshotProtocol, liq: number, hold: number, mom: number, growth: number | null, age: number | null): string[] {
  const signals: string[] = [];
  if (liq >= 0.7) signals.push('Deep liquidity pools');
  if (hold >= 0.7) signals.push('Healthy holder distribution');
  if (mom >= 0.6) signals.push('Strong organic volume momentum');
  if (growth !== null && growth > 10) signals.push('Rapid TVL growth (>10% 7d)');
  if (age !== null && age > 365) signals.push('Established protocol (>1 year)');
  if (p.chains.length >= 3) signals.push('Multi-chain deployment');
  if (p.tvl_usd > 100_000_000) signals.push('Significant TVL (> $100M)');
  return signals.length > 0 ? signals : ['Baseline fundamentals'];
}

function generateRedFlags(p: SnapshotProtocol, liq: number, hold: number, mom: number, growth: number | null, age: number | null, riskFlags: string[]): string[] {
  const flags = [...riskFlags];
  if (liq < 0.4) flags.push('Shallow liquidity depth');
  if (hold < 0.4) flags.push('High holder concentration risk');
  if (mom < 0.35) flags.push('Weak organic volume');
  if (growth !== null && growth < -15) flags.push('Accelerating TVL decline');
  if (age !== null && age < 90) flags.push('Very new protocol');
  if (p.chains.length === 1 && p.tvl_usd < 100_000_000) flags.push('Single-chain concentration');
  return flags.length > 0 ? flags : ['No material red flags'];
}

function generateVerdict(composite: number, tier: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL', protocol?: SnapshotProtocol, subScores?: SubScores): string {
  const chain = protocol?.chains[0] || 'main chain';
  const tvl = protocol?.tvl_usd || 0;
  const cap = subScores?.capital_efficiency_ratio || 1;
  const holderTop10 = subScores?.top10_holder_pct || 0.3;

  if (composite >= 75) return `STRONG BUY — Excellent fundamentals. Farm $150 on ${chain}, 45d hold. Top10 holders: ${Math.round(holderTop10*100)}%. Cap efficiency: ${cap.toFixed(1)}x.`;
  if (composite >= 63) return `BUY — Strong candidate (PASS >=63). Farm $100 on ${chain}, 60d hold. Top10 holders: ${Math.round(holderTop10*100)}%. Cap efficiency: ${cap.toFixed(1)}x.`;
  if (composite >= 50) return `WATCH — Decent fundamentals, monitor for entry. Small position $50 on ${chain}. Top10 holders: ${Math.round(holderTop10*100)}%.`;
  if (composite >= 40) return `CAUTION — Mixed signals. Avoid or minimal position only. Top10 holders: ${Math.round(holderTop10*100)}%.`;
  return `AVOID — Significant risks outweigh rewards. Top10 holders: ${Math.round(holderTop10*100)}%.`;
}

const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

export interface BoardSummary {
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
}

export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();

  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }

  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);

  for (const p of early) chosen.set(p.slug, p);

  const allLiquidity: number[] = [];
  const allHolder: number[] = [];
  const allMomentum: number[] = [];

  [...chosen.values()].forEach(p => {
    allLiquidity.push(computeLiquidityScore(p, snapshot.as_of));
    allHolder.push(computeHolderScore(p, snapshot.as_of));
    allMomentum.push(computeMomentumScore(p));
  });

  const scored = [...chosen.values()].map((p) => {
    const { implied, growthPct, growthMult, maturityMult, liquidityScore, holderScore, momentumScore, riskFlags, riskPenalty, age, subScores, cohortPercentile } = impliedValue(p, snapshot.as_of, model, allLiquidity, allHolder, allMomentum);
    return { p, implied, growthPct, growthMult, maturityMult, liquidityScore, holderScore, momentumScore, riskFlags, riskPenalty, age, subScores, cohortPercentile };
  });

  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));

  const boardRows = scored.map((s, i) => {
    const composite = Math.round((s.subScores.liquidity_depth + s.subScores.holder_safety + s.subScores.momentum_organic) * 100 / 3);
    const tier = riskTier(composite / 100);
    const bullish = generateBullishSignals(s.p, s.subScores.liquidity_depth, s.subScores.holder_safety, s.subScores.momentum_organic, s.growthPct, s.age);
    const redFlags = generateRedFlags(s.p, s.subScores.liquidity_depth, s.subScores.holder_safety, s.subScores.momentum_organic, s.growthPct, s.age, s.riskFlags);
    const verdict = generateVerdict(composite, tier, s.p, s.subScores);
    const stage = tgeStage(s.age, s.growthPct);
    const readiness = tgeReadiness(s.age, s.growthPct);

    const analysis: TokenAnalysis = {
      composite_score: composite,
      sub_scores: s.subScores,
      risk_tier: tier,
      confidence: clamp(0.5 + (s.cohortPercentile / 100) * 0.4, 0.5, 0.9),
      bullish_signals: bullish,
      red_flags: redFlags,
      cohort_percentile: Math.round(s.cohortPercentile),
      tge_stage: stage,
      tge_readiness: readiness,
      verdict
    };

    return {
      rank: i + 1,
      slug: s.p.slug,
      name: s.p.name,
      category: s.p.category,
      chains: s.p.chains,
      tvl_usd: s.p.tvl_usd,
      change_7d: s.p.change_7d,
      mcap_usd: s.p.mcap_usd,
      listed_at: s.p.listed_at,
      gecko_id: s.p.gecko_id,
      symbol: s.p.symbol,
      token_status: 'pre-token',
      age_days: s.age,
      implied_value_usd: s.implied,
      model: {
        base_multiple: model.base_multiple,
        growth_pct: s.growthPct,
        growth_multiplier: round4(s.growthMult),
        maturity_multiplier: round4(s.maturityMult),
        liquidity_score: round4(s.liquidityScore),
        holder_score: round4(s.holderScore),
        momentum_score: round4(s.momentumScore),
        risk_flags: s.riskFlags,
        risk_penalty: round4(s.riskPenalty),
        age_days: s.age,
      },
      farm_steps: farmSteps(s.p, s.age).map(stepText),
      analysis
    };
  });

  return boardRows;
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const action = actionFor(p, capital, chain);
  return [
    { text: `Use a fresh wallet that holds only the funds you plan to farm on ${chain}, and keep its seed phrase offline.`, cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
    { text: action, cost: `$${capital} of capital and about $${capital >= 150 ? 8 : 4} of gas`, time: '15 minutes to set up' },
    { text: `Make one qualifying action each week on ${chain}, such as a deposit, a borrow, a swap or a vote.`, cost: 'about $2 of gas a week', time: '10 minutes a week' },
    { text: `Hold for at least ${hold} days, then open the protocol's own rewards page, claim only from its published link, and log every step.`, cost: `the $${capital} stays in the position`, time: `${hold} days` },
  ];
}

export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    liquidity_score: row.model.liquidity_score,
    holder_score: row.model.holder_score,
    momentum_score: row.model.momentum_score,
    risk_flags: row.model.risk_flags,
    tge_stage: row.analysis?.tge_stage ?? 'Late-Stage (>365d)',
    retail_efficiency_score: row.analysis?.sub_scores.retail_efficiency_score ?? 0,
    est_net_roi_per_1k: row.analysis?.sub_scores.est_net_roi_per_1k ?? 0,
  };
}

export function buildExecutiveSummary(board: BoardRow[], snapshot: Snapshot): ExecutiveSummary {
  const passCount = board.filter(r => (r.analysis?.composite_score ?? 0) >= 63).length;
  const watchCount = board.filter(r => (r.analysis?.composite_score ?? 0) >= 50 && (r.analysis?.composite_score ?? 0) < 63).length;
  const rejectCount = board.filter(r => (r.analysis?.composite_score ?? 0) < 50).length;
  const medianLiq = board.map(r => r.analysis?.sub_scores.liquidity_depth ?? 0).sort((a, b) => a - b)[Math.floor(board.length / 2)];

  const marketRegime = passCount > board.length * 0.3 ? 'BULLISH' : passCount > board.length * 0.15 ? 'NEUTRAL' : 'BEARISH';

  const topPick = board[0] ? { slug: board[0].slug, name: board[0].name, score: board[0].analysis?.composite_score ?? 0 } : null;
  const highestRisk = board[board.length - 1] ? { slug: board[board.length - 1].slug, name: board[board.length - 1].name, score: board[board.length - 1].analysis?.composite_score ?? 0 } : null;

  const top3 = board.slice(0, 3).map(r => `${r.name} (${r.analysis?.composite_score ?? 0}/100, ${r.chains[0] || 'N/A'})`).join('; ');

  const keyTakeaways = [
    `${passCount} protocols (${Math.round(passCount / board.length * 100)}%) score PASS (>=63) — prime farming targets`,
    `${watchCount} protocols (${Math.round(watchCount / board.length * 100)}%) in WATCH zone (50-62) — monitor for entry`,
    `${rejectCount} protocols (${Math.round(rejectCount / board.length * 100)}%) flagged REJECT (<50) — avoid`,
    `Top 3: ${top3}`,
    `Median liquidity depth: ${Math.round(medianLiq * 100)}% — ${medianLiq > 0.6 ? 'healthy' : medianLiq > 0.4 ? 'moderate' : 'thin'}`,
    `Market regime: ${marketRegime} — ${marketRegime === 'BULLISH' ? 'broad strength' : marketRegime === 'NEUTRAL' ? 'mixed signals' : 'risk-off environment'}`
  ];

  return {
    market_regime: marketRegime,
    total_scanned: board.length,
    pass_count: passCount,
    watch_count: watchCount,
    reject_count: rejectCount,
    median_liquidity: Math.round(medianLiq * 100),
    top_pick: topPick,
    highest_risk_trap: highestRisk,
    key_takeaways: keyTakeaways
  };
}

export function protocolAccounting(snapshot: Snapshot, board: BoardRow[], model: ModelConstants): ProtocolAccounting {
  const total = snapshot.protocols.length;
  const alreadyTraded = snapshot.protocols.filter(p => !isPreToken(p)).length;
  const preToken = total - alreadyTraded;
  const watchlist = snapshot.watchlist.length;
  const early = board.length - watchlist;

  const multiples = snapshot.protocols
    .filter(p => p.mcap_usd !== null && p.tvl_usd > 0 && p.mcap_usd > 0)
    .map(p => p.mcap_usd! / p.tvl_usd)
    .sort((a, b) => a - b);
  const medianMultiple = multiples.length > 0 ? multiples[Math.floor(multiples.length / 2)] : 1;

  const holdoutError = snapshot.protocols
    .filter(p => p.mcap_usd !== null && p.tvl_usd > 0 && p.mcap_usd > 0)
    .reduce((acc, p) => {
      const implied = Math.max(1, Math.round(p.tvl_usd * model.base_multiple * medianMultiple));
      const actual = p.mcap_usd!;
      const err = Math.log(actual / Math.max(implied, 1));
      return acc + err * err;
    }, 0);

  return {
    total_protocols: total,
    already_traded: alreadyTraded,
    pre_token: preToken,
    watchlist: watchlist,
    early_discovery: early,
    median_multiple: medianMultiple,
    calibration_error_pct: Math.round(medianMultiple * 1000) / 10,
    holdout_squared_error: round4(holdoutError),
  };
}

export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;

  const executiveSummary = buildExecutiveSummary(board, snapshot);
  const accounting = protocolAccounting(snapshot, board, model);
  const tokenAnalyses: Record<string, TokenAnalysis> = {};
  board.forEach(r => { if (r.analysis) tokenAnalyses[r.slug] = r.analysis; });

  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    rows: board.map(radarRow),
    live,
    executive_summary: executiveSummary,
    token_analyses: tokenAnalyses,
    protocol_accounting: accounting
  };
  return { board, radar };
}

export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 5) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 40 || s.length > 350) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
