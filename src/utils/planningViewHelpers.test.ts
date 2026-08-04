import { describe, expect, it } from 'vitest';
import {
  getPlanningListViewRowSummary,
  normalizePlanningViewMode,
  shouldShowPlanningDetailPanel,
} from './planningViewHelpers';

describe('planningViewHelpers', () => {
  it('normalizes invalid view modes to tiles by default', () => {
    expect(normalizePlanningViewMode('unknown')).toBe('tiles');
    expect(normalizePlanningViewMode('list')).toBe('list');
  });

  it('builds a compact row summary for the list view', () => {
    const summary = getPlanningListViewRowSummary({
      orderId: '10042',
      item: 'TEE 200x200mm',
      itemCode: 'ABC-12',
      manufacturedItem: 'MFG-900',
      plan: 120,
      extraCode: 'P1',
      projectDesc: 'Bouwteam 1',
    }, 'W34', 45);

    expect(summary.orderId).toBe('10042');
    expect(summary.displayName).toBe('TEE 200x200mm');
    expect(summary.manufacturedItem).toBe('MFG-900');
    expect(summary.itemCode).toBe('ABC-12');
    expect(summary.quantity).toBe(120);
    expect(summary.project).toBe('Bouwteam 1');
    expect(summary.extraCode).toBe('P1');
    expect(summary.weekLabel).toBe('W34');
    expect(summary.remainingQty).toBe(45);
    expect(summary.compactLine).toBe('TEE 200x200mm • 120 st • Bouwteam 1 • P1');
  });

  it('hides the detail panel in list mode', () => {
    expect(shouldShowPlanningDetailPanel('list', '10042')).toBe(false);
    expect(shouldShowPlanningDetailPanel('tiles', '10042')).toBe(true);
    expect(shouldShowPlanningDetailPanel('tiles', null)).toBe(false);
  });
});
