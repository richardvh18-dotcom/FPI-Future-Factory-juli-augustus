import { describe, it, expect } from 'vitest';
import { shouldResetOrderLabelMachineState } from './orderLabelMachineState';

describe('shouldResetOrderLabelMachineState', () => {
  it('returns false when switching from an empty machine state', () => {
    expect(shouldResetOrderLabelMachineState('', 'BH11')).toBe(false);
  });

  it('returns true when the selected machine changes', () => {
    expect(shouldResetOrderLabelMachineState('BH11', 'BH12')).toBe(true);
  });

  it('returns false when the machine stays the same', () => {
    expect(shouldResetOrderLabelMachineState('BH11', 'BH11')).toBe(false);
  });
});
