#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const ROOT = process.cwd();
const SRC_DIR = path.join(ROOT, 'src');
const BASELINE_PATH = path.join(ROOT, '.any-baseline.json');

function countExplicitAny(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const regex = /\bany\b/g;
  return (content.match(regex) || []).length;
}

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  let total = 0;

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      total += walk(fullPath);
      continue;
    }

    const ext = path.extname(entry.name).toLowerCase();
    if (!['.ts', '.tsx', '.js', '.jsx'].includes(ext)) continue;

    total += countExplicitAny(fullPath);
  }

  return total;
}

function main() {
  if (!fs.existsSync(SRC_DIR)) {
    console.error('[check:any] src/ map niet gevonden.');
    process.exit(1);
  }

  const baselineConfig = fs.existsSync(BASELINE_PATH)
    ? JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'))
    : { baseline: 0, target: 0 };

  const totalAny = walk(SRC_DIR);
  const baseline = Number(baselineConfig?.baseline ?? 0);
  const target = Number(baselineConfig?.target ?? 0);
  const maxAllowed = Number(baselineConfig?.maxAllowed ?? baseline);

  console.log(`[check:any] expliciete any-count: ${totalAny}`);
  console.log(`[check:any] baseline: ${baseline} | max toegestaan: ${maxAllowed} | target: ${target}`);

  if (totalAny > maxAllowed) {
    console.error(`\n[check:any] FAIL: ${totalAny} > max toegestaan ${maxAllowed}.`);
    console.error('Nieuwe expliciete any-typen zijn niet toegestaan; verlaag eerst het aantal of werk de controle bewust bij.');
    process.exit(1);
  }

  if (totalAny <= target) {
    console.log('[check:any] OK: onder target threshold.');
    return;
  }

  console.log('[check:any] OK: binnen baseline, maar nog boven target.');
}

main();
