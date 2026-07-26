import { describe, it, expect } from 'vitest';
import { extractLotSequence } from './lotSequenceHelpers';

describe('extractLotSequence', () => {
  it('extracts the numeric suffix for matching lot prefixes', () => {
    expect(extractLotSequence('LOT12340001', 'LOT1234')).toBe(1);
    expect(extractLotSequence('LOT12340025', 'LOT1234')).toBe(25);
  });

  it('returns zero when the lot does not match the base prefix', () => {
    expect(extractLotSequence('ABC0001', 'LOT1234')).toBe(0);
    expect(extractLotSequence('LOT1234', 'LOT1234')).toBe(0);
  });
});
