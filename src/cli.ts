// Token Radar v2 - CLI Entrypoint
// Runs the radar, generates output, and copies dossier to Download folder

import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const projectRoot = join(here, '..');

function runMain(inputPath: string, outputDir: string): boolean {
  console.log(`[cli] Running token-radar-v2 with input: ${inputPath}, output: ${outputDir}`);

  const result = spawnSync('node', [
    join(projectRoot, 'src/main.ts'),
    '--input', inputPath,
    '--output', outputDir
  ], {
    cwd: projectRoot,
    stdio: 'inherit',
    env: { ...process.env, NODE_OPTIONS: '--experimental-strip-types' }
  });

  if (result.status !== 0) {
    console.error(`[cli] main.ts exited with code ${result.status}`);
    return false;
  }
  return true;
}

function generateScreenshots(): boolean {
  console.log('[cli] Generating screenshots...');

  const result = spawnSync('node', [
    join(projectRoot, 'src/generate-screenshots.ts')
  ], {
    cwd: projectRoot,
    stdio: 'inherit',
    env: { ...process.env, NODE_OPTIONS: '--experimental-strip-types' }
  });

  if (result.status !== 0) {
    console.error('[cli] Screenshot generation failed');
    return false;
  }
  return true;
}

function copyDossierToDownload(outputDir: string): boolean {
  const sourcePath = join(outputDir, 'dossier.json');
  const downloadDir = '/sdcard/Download';
  const destPath = join(downloadDir, 'token-radar-v2-dossier.json');

  if (!existsSync(sourcePath)) {
    console.error(`[cli] Source dossier not found: ${sourcePath}`);
    return false;
  }

  try {
    if (!existsSync(downloadDir)) {
      mkdirSync(downloadDir, { recursive: true });
    }
    copyFileSync(sourcePath, destPath);
    console.log(`[cli] Copied dossier to ${destPath}`);
    return true;
  } catch (err) {
    console.error(`[cli] Failed to copy dossier: ${err}`);
    return false;
  }
}

function printUsage() {
  console.log(`
Token Radar v2 - CLI

Usage:
  token-radar-v2 [options]

Options:
  --input <path>       Path to snapshot.json or directory containing it (default: /input/snapshot.json)
  --output <path>      Output directory (default: ./output)
  --download           Copy dossier.json to /sdcard/Download/token-radar-v2-dossier.json
  --screenshots-only   Only generate screenshots (requires existing output/data.js)
  --verify             Run twice and verify deterministic output (SHA-256 match)
  --help               Show this help

Examples:
  token-radar-v2 --input input/snapshot.json --output output --download
  token-radar-v2 --verify
  token-radar-v2 --screenshots-only
`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    printUsage();
    process.exit(0);
  }

  const inputIdx = args.indexOf('--input');
  const inputPath = inputIdx >= 0 && inputIdx + 1 < args.length
    ? args[inputIdx + 1]
    : '/input/snapshot.json';

  const outputIdx = args.indexOf('--output');
  const outputDir = outputIdx >= 0 && outputIdx + 1 < args.length
    ? args[outputIdx + 1]
    : join(projectRoot, 'output');

  const shouldDownload = args.includes('--download');
  const screenshotsOnly = args.includes('--screenshots-only');
  const shouldVerify = args.includes('--verify');

  if (shouldVerify) {
    console.log('[cli] Running determinism verification (2 runs)...');
    const rm = rmSync;

    const tempDir1 = join(projectRoot, 'output-verify-1');
    const tempDir2 = join(projectRoot, 'output-verify-2');

    // Clean previous verification directories
    if (existsSync(tempDir1)) rm(tempDir1, { recursive: true });
    if (existsSync(tempDir2)) rm(tempDir2, { recursive: true });

    console.log('[cli] Run 1...');
    if (!runMain(inputPath, tempDir1)) {
      console.error('[cli] Run 1 failed');
      process.exit(1);
    }

    console.log('[cli] Run 2...');
    if (!runMain(inputPath, tempDir2)) {
      console.error('[cli] Run 2 failed');
      process.exit(1);
    }

    const { createHash } = await import('node:crypto');
    const { readFileSync } = await import('node:fs');

    const hash1 = createHash('sha256').update(readFileSync(join(tempDir1, 'dossier.json'))).digest('hex');
    const hash2 = createHash('sha256').update(readFileSync(join(tempDir2, 'dossier.json'))).digest('hex');

    console.log(`[cli] Run 1 dossier SHA-256: ${hash1}`);
    console.log(`[cli] Run 2 dossier SHA-256: ${hash2}`);

    if (hash1 === hash2) {
      console.log('[cli] ✓ Deterministic: SHA-256 match!');
      process.exit(0);
    } else {
      console.error('[cli] ✗ Non-deterministic: SHA-256 mismatch!');
      process.exit(1);
    }
  }

  if (screenshotsOnly) {
    if (!generateScreenshots()) {
      process.exit(1);
    }
    console.log('[cli] Screenshots generated successfully');
    process.exit(0);
  }

  console.log('[cli] Step 1: Running main to generate data.js...');
  if (!runMain(inputPath, outputDir)) {
    process.exit(1);
  }

  console.log('[cli] Step 2: Generating screenshots...');
  if (!generateScreenshots()) {
    process.exit(1);
  }

  console.log('[cli] Step 3: Running main again to copy screenshots and build dossier...');
  if (!runMain(inputPath, outputDir)) {
    process.exit(1);
  }

  if (shouldDownload) {
    if (!copyDossierToDownload(outputDir)) {
      process.exit(1);
    }
  }

  console.log('[cli] Token Radar v2 completed successfully!');
}

main().catch(err => {
  console.error('[cli] Fatal error:', err);
  process.exit(1);
});