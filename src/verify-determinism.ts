// Determinism verification for Token Radar v3.
// Runs the pipeline twice into temp dirs and compares SHA-256 hashes of all 4 screenshots.
import { readFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const here = fileURLToPath(new URL('.', import.meta.url));
const projectRoot = join(here, '..');
const snap = join(projectRoot, 'input', 'snapshot.json');
const outA = join(projectRoot, '.verify-a');
const outB = join(projectRoot, '.verify-b');

const screenshots = [
  '01-market-overview.png',
  '02-filtered-opportunities.png',
  '03-protocol-detail-farm.png',
  '04-calibration-methodology.png',
];

function hashOf(p: string): string {
  return createHash('sha256').update(readFileSync(p)).digest('hex');
}

function runPipeline(outDir: string): void {
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  execFileSync(process.execPath, ['src/main.ts', '--input', snap, '--output', outDir], { cwd: projectRoot, stdio: 'ignore' });
  execFileSync(process.execPath, ['src/generate-screenshots.ts'], {
    cwd: projectRoot,
    env: { ...process.env, MAKEFUN_OUTPUT_DIR: outDir },
    stdio: 'ignore',
  });
}

function main(): void {
  runPipeline(outA);
  runPipeline(outB);

  console.log('--- DETERMINISM CHECK (two runs must match) ---');
  let allMatch = true;
  for (const f of screenshots) {
    const ha = hashOf(join(outA, 'screenshots', f));
    const hb = hashOf(join(outB, 'screenshots', f));
    const bytes = readFileSync(join(outA, 'screenshots', f)).length;
    const ok = ha === hb;
    if (!ok) allMatch = false;
    console.log(`${ok ? 'OK' : 'MISMATCH'}  ${f}  sha=${ha}  bytes=${bytes}`);
  }

  console.log('\n--- BYTE SIZES (project screenshots/) ---');
  let total = 0;
  for (const f of screenshots) {
    const b = readFileSync(join(projectRoot, 'screenshots', f)).length;
    total += b;
    console.log(`${f}: ${b} bytes`);
  }
  console.log(`Total screenshots bytes: ${total}`);

  console.log('\n--- DASHBOARD BYTE SIZES ---');
  let dashTotal = 0;
  for (const f of ['index.html', 'app.css', 'app.js']) {
    const b = readFileSync(join(projectRoot, 'dashboard', f)).length;
    dashTotal += b;
    console.log(`${f}: ${b} bytes`);
  }
  console.log(`Total dashboard bytes: ${dashTotal} (< 54000 required)`);

  rmSync(outA, { recursive: true, force: true });
  rmSync(outB, { recursive: true, force: true });

  let failed = false;
  if (!allMatch) { console.error('DETERMINISM FAILED: hashes differ'); failed = true; }
  if (dashTotal >= 54000) { console.error('DASHBOARD SIZE CAP VIOLATED'); failed = true; }
  if (total > 4 * 524288) { console.error('SCREENSHOTS EXCEED TOTAL BUDGET'); failed = true; }

  if (failed) { process.exit(1); }
  console.log('\nALL VERIFICATIONS PASSED');
}

main();
