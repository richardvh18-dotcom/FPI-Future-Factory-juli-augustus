import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('type-safety baseline check', () => {
  it('exposes a check-any script and baseline config', () => {
    const root = process.cwd();
    const scriptPath = join(root, 'scripts', 'check-any-count.cjs');
    const baselinePath = join(root, '.any-baseline.json');

    expect(existsSync(scriptPath)).toBe(true);
    expect(existsSync(baselinePath)).toBe(true);

    const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
    expect(baseline).toMatchObject({
      baseline: expect.any(Number),
      maxAllowed: expect.any(Number),
      target: expect.any(Number),
    });

    expect(baseline.maxAllowed).toBeLessThanOrEqual(baseline.baseline);
  });
});
