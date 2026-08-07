const { isValidPrintQueueTransition } = require('../functions/src/services/printQueueTransitionRules');

describe('print queue transition validation', () => {
  it('allows pending-like states to transition to printing', () => {
    expect(isValidPrintQueueTransition({ currentStatus: 'pending', nextStatus: 'printing' })).toBe(true);
    expect(isValidPrintQueueTransition({ currentStatus: 'queued', nextStatus: 'printing' })).toBe(true);
    expect(isValidPrintQueueTransition({ currentStatus: 'processing', nextStatus: 'printing' })).toBe(true);
  });

  it('allows pending-like states to complete once work was already claimed', () => {
    expect(isValidPrintQueueTransition({ currentStatus: 'queued', nextStatus: 'completed' })).toBe(true);
    expect(isValidPrintQueueTransition({ currentStatus: 'processing', nextStatus: 'completed' })).toBe(true);
  });

  it('keeps terminal transitions explicit and unchanged', () => {
    expect(isValidPrintQueueTransition({ currentStatus: 'printing', nextStatus: 'completed' })).toBe(true);
    expect(isValidPrintQueueTransition({ currentStatus: 'printing', nextStatus: 'error' })).toBe(true);
    expect(isValidPrintQueueTransition({ currentStatus: 'error', nextStatus: 'pending' })).toBe(true);
  });
});
