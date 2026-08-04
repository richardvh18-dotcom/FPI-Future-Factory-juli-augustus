import { describe, expect, it } from 'vitest';
import { shouldUseGlobalOrderLabelSearch } from './orderLabelSearch';

describe('shouldUseGlobalOrderLabelSearch', () => {
  it('returns true when no machine is selected and the query is long enough', () => {
    expect(shouldUseGlobalOrderLabelSearch('', 'ABC123')).toBe(true);
  });

  it('returns false when a machine is already selected', () => {
    expect(shouldUseGlobalOrderLabelSearch('BH18', 'ABC123')).toBe(false);
  });

  it('returns false for short queries', () => {
    expect(shouldUseGlobalOrderLabelSearch('', 'AB')).toBe(false);
  });
});
