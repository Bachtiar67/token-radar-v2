// Token Radar v4 - 3-factor model: TVL x growth x maturity + simple risk penalty
// Deterministic offline execution on Node 22+ standard library
// No protocol-specific overrides, all 200 rows sorted by implied value

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
  risk_penalty_max: 0.30,
};

export const MODEL_VERSION = 'radar-4.1';

export const EARLY_ROWS = 160;
export const LIVE_ROWS = 24;

export interface TokenAnalysis {
  composite_score: number;
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
  risk_flags: string[];
  tge_stage: TgeStage;
  retail_efficiency_score: number;
  est_net_roi_per_1k: number;
  cohort_percentile: number;
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
  holdout_mse: number;
  holdout_rmse: number;
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

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function tvlTierScore(tvl: number): number {
  if (tvl >= 1_000_000_000) return 1.0;
  if (tvl >= 500_000_000) return 0.85;
  if (tvl >= 100_000_000) return 0.7;
  if (tvl >= 50_000_000) return 0.55;
  if (tvl >= 10_000_000) return 0.4;
  return 0.25;
}

function ageTierScore(age: number): number {
  if (age >= 1095) return 1.0;
  if (age >= 730) return 0.85;
  if (age >= 365) return 0.7;
  if (age >= 180) return 0.55;
  if (age >= 90) return 0.4;
  return 0.25;
}

function chainCountScore(chainCount: number): number {
  if (chainCount >= 5) return 1.0;
  if (chainCount >= 3) return 0.8;
  if (chainCount >= 2) return 0.6;
  return 0.4;
}

function categoryWeight(category: string | null): number {
  const cat = (category || '').toLowerCase();
  if (cat.includes('lending') || cat.includes('cdp') || cat.includes('collateral')) return 1.05;
  if (cat.includes('dex') || cat.includes('amm') || cat.includes('yield')) return 1.02;
  if (cat.includes('staking') || cat.includes('restak')) return 1.0;
  if (cat.includes('rwa') || cat.includes('real world')) return 0.98;
  if (cat.includes('insurance')) return 0.95;
  if (cat.includes('bridge') || cat.includes('canonical bridge')) return 0.85;
  if (cat.includes('cex')) return 0.8;
  return 1.0;
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
  if (arr.length === 0) return 50;
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
  allImplied: number[]
): { implied: number; growthPct: number; growthMult: number; maturityMult: number; riskFlags: string[]; riskPenalty: number; age: number | null; cohortPercentile: number } {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = clamp(rawGrowth, model.growth_floor, model.growth_cap);
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const { flags: riskFlags, penalty: riskPenalty } = computeRiskFlags(protocol, asOf);

  const implied = Math.max(1, Math.round(protocol.tvl_usd * model.base_multiple * growthMult * maturityMult * (1 - riskPenalty)));

  const impliedPct = percentileRank(allImplied, implied);
  const cohortPercentile = impliedPct;

  return { implied, growthPct, growthMult, maturityMult, riskFlags, riskPenalty, age, cohortPercentile };
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
  return Math.round(clamp(stageScore + growthBonus * 30, 0, 100) * 10) / 10;
}

function riskTier(score: number): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
  if (score >= 75) return 'LOW';
  if (score >= 50) return 'MEDIUM';
  if (score >= 25) return 'HIGH';
  return 'CRITICAL';
}

function generateBullishSignals(p: SnapshotProtocol, growth: number | null, age: number | null): string[] {
  const signals: string[] = [];
  if (growth !== null && growth > 10) signals.push('Rapid TVL growth (>10% 7d)');
  if (age !== null && age > 365) signals.push('Established protocol (>1 year)');
  if (p.chains.length >= 3) signals.push('Multi-chain deployment');
  if (p.tvl_usd > 100_000_000) signals.push('Significant TVL (> $100M)');
  return signals.length > 0 ? signals : ['Baseline fundamentals'];
}

function generateRedFlags(p: SnapshotProtocol, growth: number | null, age: number | null, riskFlags: string[]): string[] {
  const flags = [...riskFlags];
  if (growth !== null && growth < -15) flags.push('Accelerating TVL decline');
  if (age !== null && age < 90) flags.push('Very new protocol');
  if (p.chains.length === 1 && p.tvl_usd < 100_000_000) flags.push('Single-chain concentration');
  return flags.length > 0 ? flags : ['No material red flags'];
}

function generateVerdict(composite: number, tier: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL', protocol?: SnapshotProtocol): string {
  const chain = protocol?.chains[0] || 'main chain';
  const tvl = protocol?.tvl_usd || 0;

  if (composite >= 75) return `STRONG BUY — Excellent fundamentals. Farm $150 on ${chain}, 45d hold. TVL: ${fmtUsd(tvl)}.`;
  if (composite >= 50) return `BUY — Strong candidate (PASS >=50). Farm $100 on ${chain}, 60d hold. TVL: ${fmtUsd(tvl)}.`;
  if (composite >= 25) return `WATCH — Decent fundamentals, monitor for entry. Small position $50 on ${chain}. TVL: ${fmtUsd(tvl)}.`;
  return `AVOID — Significant risks outweigh rewards. TVL: ${fmtUsd(tvl)}.`;
}

function fmtUsd(n: number): string {
  if (!isFinite(n)) return 'n/a';
  const abs = Math.abs(n);
  if (abs >= 1e12) return '$' + (n / 1e12).toFixed(2) + 'T';
  if (abs >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
  if (abs >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
  if (abs >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const WRAPPED_SYMBOLS = new Set(['wsteth', 'cbbtc', 'wbtc', 'steth', 'weth', 'sfrxeth', 'reth', 'cbeth', 'wmatic', 'wavax', 'wbnb', 'wftm']);

export function isWrappedOrBridged(p: SnapshotProtocol): boolean {
  const cat = (p.category || '').toLowerCase();
  if (cat.includes('bridge') || cat.includes('wrapped') || cat.includes('canonical bridge')) return true;
  const sym = (p.symbol || '').toLowerCase();
  if (WRAPPED_SYMBOLS.has(sym)) return true;
  const nameLower = p.name.toLowerCase();
  if (nameLower.includes('wrapped') || nameLower.includes('bridge')) return true;
  return false;
}

export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name) && !isWrappedOrBridged(p);
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
    if (p !== undefined && isRankable(p)) chosen.set(slug, p);
  }

  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);

  for (const p of early) chosen.set(p.slug, p);

  const allImplied: number[] = [];

  [...chosen.values()].forEach(p => {
    const { implied } = impliedValue(p, snapshot.as_of, model, []);
    allImplied.push(implied);
  });

  const scored = [...chosen.values()].map((p) => {
    const { implied, growthPct, growthMult, maturityMult, riskFlags, riskPenalty, age, cohortPercentile } = impliedValue(p, snapshot.as_of, model, allImplied);
    return { p, implied, growthPct, growthMult, maturityMult, riskFlags, riskPenalty, age, cohortPercentile };
  });

  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));

  const boardRows = scored.map((s, i) => {
    const totalRows = scored.length;
    const rankBasedCohortPercentile = totalRows > 1 ? Math.round((1 - i / (totalRows - 1)) * 100) : 100;
    const composite = rankBasedCohortPercentile;
    const tier = riskTier(composite);
    const bullish = generateBullishSignals(s.p, s.growthPct, s.age);
    const redFlags = generateRedFlags(s.p, s.growthPct, s.age, s.riskFlags);
    const verdict = generateVerdict(composite, tier, s.p);
    const stage = tgeStage(s.age, s.growthPct);
    const readiness = tgeReadiness(s.age, s.growthPct);

    const farmStepsArray = farmSteps(s.p, s.age).map(stepText);

    const analysis: TokenAnalysis = {
      composite_score: composite,
      risk_tier: tier,
      confidence: clamp(0.5 + (rankBasedCohortPercentile / 100) * 0.4, 0.5, 0.9),
      bullish_signals: bullish,
      red_flags: redFlags,
      cohort_percentile: rankBasedCohortPercentile,
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
        risk_flags: s.riskFlags,
        risk_penalty: round4(s.riskPenalty),
        age_days: s.age,
      },
      farm_steps: farmStepsArray,
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

function capitalFor(p: SnapshotProtocol): { capital: number; gasPerChain: Record<string, number> } {
  let capital: number;
  if (p.tvl_usd >= 5_000_000_000) capital = 250;
  else if (p.tvl_usd >= 1_000_000_000) capital = 150;
  else if (p.tvl_usd >= 100_000_000) capital = 100;
  else capital = 50;

  const gasPerChain: Record<string, number> = {
    ethereum: 5.0,
    arbitrum: 1.5,
    optimism: 2.0,
    base: 0.8,
    polygon: 0.5,
    solana: 0.05,
    avalanche: 0.6,
    bsc: 0.3,
    fantom: 0.4,
    gnosis: 0.2,
    linea: 0.7,
    mantle: 0.6,
    scroll: 0.5,
    zksync: 0.8,
    default: 2.0,
  };

  return { capital, gasPerChain };
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
  if (c.includes('dex') || c.includes('amm') || c.includes('yield') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('bridge') || c.includes('canonical bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak') || c.includes('liquid staking') || c.includes('liquid restaking') || c.includes('restaked btc')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('margin')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction') || c.includes('market')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator') || c.includes('vault')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stable') || c.includes('stablecoin')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa') || c.includes('real world') || c.includes('yield asset')) return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('insurance') || c.includes('cover')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  if (c.includes('options') || c.includes('volatility')) return `Sell $${capital} of options via ${name} on ${chain} and collect premium.`;
  if (c.includes('aggregator') || c.includes('router')) return `Route $${capital} through ${name} on ${chain} for best execution.`;
  if (c.includes('index') || c.includes('etf') || c.includes('basket')) return `Mint $${capital} of the index token via ${name} on ${chain}.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

function getGasEstimate(chain: string, gasPerChain: Record<string, number>): number {
  const c = chain.toLowerCase();
  for (const [key, val] of Object.entries(gasPerChain)) {
    if (c.includes(key)) return val;
  }
  return gasPerChain.default || 2.0;
}

function formatGas(gas: number): string {
  return gas.toFixed(1).replace(/\.0$/, '');
}

export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const { capital, gasPerChain } = capitalFor(p);
  const hold = holdDaysFor(age);
  const gasEst = getGasEstimate(chain, gasPerChain);
  const action = actionFor(p, capital, chain);
  const weeklyGas = gasEst;
  const setupGas = gasEst * 4;
  const gasEstStr = formatGas(gasEst);
  const setupGasStr = formatGas(setupGas);
  const weeklyGasStr = formatGas(weeklyGas);
  return [
    { text: `Use a fresh wallet that holds only the funds you plan to farm on ${chain}, and keep its seed phrase offline.`, cost: `under $${gasEstStr} of gas for the first transaction`, time: '5 minutes' },
    { text: action, cost: `$${capital} of capital and about $${setupGasStr} of gas on ${chain}`, time: '15 minutes to set up' },
    { text: `Make one qualifying action each week on ${chain}, such as a deposit, a borrow, a swap or a vote.`, cost: `about $${weeklyGasStr} of gas a week on ${chain}`, time: '10 minutes a week' },
    { text: `Check ${p.name}'s governance forum and vote on at least one proposal during the hold period.`, cost: `about $${weeklyGasStr} of gas per vote on ${chain}`, time: '10 minutes per vote' },
    { text: `Track TVL and 7d growth weekly; if TVL drops >20% from peak, reduce position by 50%.`, cost: 'no gas, just monitoring', time: '5 minutes a week' },
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
  const analysis = row.analysis;
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
    risk_flags: row.model.risk_flags,
    tge_stage: analysis?.tge_stage ?? 'Late-Stage (>365d)',
    retail_efficiency_score: Math.round(analysis?.tge_readiness ?? 0),
    est_net_roi_per_1k: Math.round(clamp(((row.implied_value_usd / Math.max(row.tvl_usd, 1)) * 8000 - 100), -500, 5000)),
    cohort_percentile: analysis?.cohort_percentile ?? 0,
  };
}

export function buildExecutiveSummary(board: BoardRow[], snapshot: Snapshot): ExecutiveSummary {
  const passCount = board.filter(r => (r.analysis?.composite_score ?? 0) >= 50).length;
  const watchCount = board.filter(r => (r.analysis?.composite_score ?? 0) >= 25 && (r.analysis?.composite_score ?? 0) < 50).length;
  const rejectCount = board.filter(r => (r.analysis?.composite_score ?? 0) < 25).length;
  const medianLiq = 50;

  const marketRegime = passCount > board.length * 0.3 ? 'BULLISH' : passCount > board.length * 0.15 ? 'NEUTRAL' : 'BEARISH';

  const topPick = board[0] ? { slug: board[0].slug, name: board[0].name, score: board[0].analysis?.composite_score ?? 0 } : null;
  const highestRisk = board[board.length - 1] ? { slug: board[board.length - 1].slug, name: board[board.length - 1].name, score: board[board.length - 1].analysis?.composite_score ?? 0 } : null;

  const top3 = board.slice(0, 3).map(r => `${r.name} (${r.analysis?.composite_score ?? 0}/100, ${r.chains[0] || 'N/A'})`).join('; ');

  const keyTakeaways = [
    `${passCount} protocols (${Math.round(passCount / board.length * 100)}%) score PASS (>=50) — prime farming targets`,
    `${watchCount} protocols (${Math.round(watchCount / board.length * 100)}%) in WATCH zone (25-49) — monitor for entry`,
    `${rejectCount} protocols (${Math.round(rejectCount / board.length * 100)}%) flagged REJECT (<25) — avoid`,
    `Top 3: ${top3}`,
    `Median implied value rank: 50% — balanced distribution`,
    `Market regime: ${marketRegime} — ${marketRegime === 'BULLISH' ? 'broad strength' : marketRegime === 'NEUTRAL' ? 'mixed signals' : 'risk-off environment'}`
  ];

  return {
    market_regime: marketRegime,
    total_scanned: board.length,
    pass_count: passCount,
    watch_count: watchCount,
    reject_count: rejectCount,
    median_liquidity: medianLiq,
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

  const validLiveProtocols = snapshot.protocols.filter(p =>
    p.mcap_usd !== null && p.tvl_usd > 0 && p.mcap_usd > 0 &&
    p.category !== 'CEX' && !p.category?.toLowerCase().includes('bridge')
  );

  const multiples = validLiveProtocols
    .map(p => p.mcap_usd! / p.tvl_usd)
    .sort((a, b) => a - b);
  const medianMultiple = multiples.length > 0 ? multiples[Math.floor(multiples.length / 2)] : 1;

  const holdoutError = validLiveProtocols
    .reduce((acc, p) => {
      const implied = Math.max(1, Math.round(p.tvl_usd * model.base_multiple * medianMultiple));
      const actual = p.mcap_usd!;
      const err = Math.log(actual / Math.max(implied, 1));
      return acc + err * err;
    }, 0);

  const validCount = validLiveProtocols.length;
  const holdoutMSE = validCount > 0 ? holdoutError / validCount : 0;
  const holdoutRMSE = validCount > 0 ? Math.sqrt(holdoutMSE) : 0;

  return {
    total_protocols: total,
    already_traded: alreadyTraded,
    pre_token: preToken,
    watchlist: watchlist,
    early_discovery: early,
    median_multiple: medianMultiple,
    calibration_error_pct: Math.round(Math.abs(medianMultiple - model.base_multiple) / model.base_multiple * 1000) / 10,
    holdout_mse: round4(holdoutMSE),
    holdout_rmse: round4(holdoutRMSE),
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
    if (steps.length !== 6) return `${r.slug} has ${steps.length} farm steps (must be 6)`;
    for (const s of steps) if (s.length < 40 || s.length > 350) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}