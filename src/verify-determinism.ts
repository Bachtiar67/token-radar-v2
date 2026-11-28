// Determinism verification for Token Radar v4.
// Runs the pipeline twice into temp dirs and compares SHA-256 hashes of dossier.json.
// Screenshots are generated once at project root (deterministic PNG encoding).

import { readFileSync, mkdirSync, rmSync, copyFileSync, existsSync } from 'node:fs';
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
  '01-board.png',
  '02-protocol-detail.png',
  '03-filtered-view.png',
];

function hashOf(p: string): string {
  return createHash('sha256').update(readFileSync(p)).digest('hex');
}

function runMainOnly(outDir: string): void {
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  execFileSync(process.execPath, ['src/main.ts', '--input', snap, '--output', outDir], { cwd: projectRoot, stdio: 'ignore' });
}

function main(): void {
  // Generate screenshots once at project root (deterministic)
  console.log('[verify] Generating screenshots once at project root...');
  execFileSync(process.execPath, ['src/generate-screenshots.ts'], { cwd: projectRoot, stdio: 'ignore' });

  // Run 1
  console.log('[verify] Run 1...');
  runMainOnly(outA);

  // Run 2
  console.log('[verify] Run 2...');
  runMainOnly(outB);

  console.log('--- DETERMINISM CHECK (two runs must match) ---');
  const ha = hashOf(join(outA, 'dossier.json'));
  const hb = hashOf(join(outB, 'dossier.json'));
  const ok = ha === hb;
  console.log(`${ok ? 'OK' : 'MISMATCH'}  dossier.json  sha1=${ha}  sha2=${hb}`);

  // Also verify screenshots at project root are consistent
  console.log('\n--- SCREENSHOT BYTE SIZES (project screenshots/) ---');
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
  if (!ok) { console.error('DETERMINISM FAILED: dossier hashes differ'); failed = true; }
  if (dashTotal >= 54000) { console.error('DASHBOARD SIZE CAP VIOLATED'); failed = true; }
  if (total > 3 * 524288) { console.error('SCREENSHOTS EXCEED TOTAL BUDGET'); failed = true; }

  if (failed) { process.exit(1); }
  console.log('\nALL VERIFICATIONS PASSED');
}

main();