import { describe, expect, test } from 'vitest';
import { processLabelData } from './labelHelpers';

describe('labelHelpers special elbow rules', () => {
  test('AB/AB elbow should force 45° and append ADJUSTING', () => {
    const result = processLabelData({
      item: 'Elbow AB/AB 300mm',
      description: 'Elbow AB/AB 300mm',
      extraCode: 'TEST',
    });

    expect(result.productType).toBe('ELBOW 45°');
    expect(result.connectionLine).toBe('AB-AB ADJUSTING');
  });

  test('SB/SB elbow should force 45° without ADJUSTING', () => {
    const result = processLabelData({
      item: 'Elbow SB SB 200mm',
      description: 'Elbow SB SB 200mm',
      extraCode: 'TEST',
    });

    expect(result.productType).toBe('ELBOW 45°');
    expect(result.connectionLine).toBe('SB-SB');
  });
});
