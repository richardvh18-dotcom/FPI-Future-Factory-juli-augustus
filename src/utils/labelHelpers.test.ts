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

  test('RED SHO should stay SHORT REDUCER on labels', () => {
    const result = processLabelData({
      item: '## Red Sho 315x250mm',
      description: '## Red Sho 315x250mm',
      extraCode: 'TEST',
    });

    expect(result.productType).toBe('SHORT REDUCER');
  });

  test('WYE should be treated as tee variant with ID and ID1', () => {
    const result = processLabelData({
      item: 'WYE 315x250mm',
      description: 'WYE 315x250mm EST 32',
      extraCode: 'TEST',
    });

    expect(result.productType).toBe('UNEQUAL-Y-TEE');
    expect(result.idLine).toBe('ID: 315x250mm (13"x10")');
    expect(result.id).toBe('315mm (13")');
    expect(result.id1).toBe('250mm (10")');
    expect(result.materialLine).toBe('Y-TEE');
    expect(result.materialSystemLine).toBe('Y-TEE');
  });

  test('Y-TEE should be treated as tee variant with ID and ID1', () => {
    const result = processLabelData({
      item: 'Y-TEE 400x400mm',
      description: 'Y-TEE 400x400mm',
      extraCode: 'TEST',
    });

    expect(result.productType).toBe('EQUAL-Y-TEE');
    expect(result.id).toBe('400mm (16")');
    expect(result.id1).toBe('400mm (16")');
  });

  test('WYE packed code 08083 should resolve ID 80 and ID1 83', () => {
    const result = processLabelData({
      item: 'YB4MESS08083E0BCCBB0',
      description: 'WYE EST 32 CB-CB',
      itemCode: 'YB4MESS08083E0BCCBB0',
      extraCode: 'TEST',
    });

    expect(result.productType).toBe('YB4MESS08083E0BCCBB0');
    expect(result.id).toBe('80mm (3")');
    expect(result.id1).toBe('83mm (3")');
    expect(result.id1Line).toBe('ID1: 83mm (3")');
  });
});
