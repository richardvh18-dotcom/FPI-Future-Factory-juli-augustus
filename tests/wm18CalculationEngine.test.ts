import { describe, it, expect } from 'vitest';
import { calculateWm18Item, generateWm18RapidCode } from '../src/services/wm18CalculationEngine';

describe('wm18CalculationEngine', () => {
  it('calculates 6D targets and winding parameters for a standard 250mm 90deg elbow', () => {
    const result = calculateWm18Item({
      diameterMm: 250,
      mofType: 'TB',
      series: 'EST',
      pressureClass: 'PN16',
      angleDeg: 90,
      radiusMm: 375,
      twMm: 4.9,
    });

    expect(result.id).toBe('wm18_250_tb_90_est');
    expect(result.diameterMm).toBe(250);
    expect(result.mofType).toBe('TB');
    expect(result.angleDeg).toBe(90);
    expect(result.gangenCount).toBe(5); // Math.ceil(4.9 / 1)
    expect(result.stn1Targets.pos1.rx).toBe(-30);
    expect(result.stn1Targets.pos1.ry).toBe(90);
    expect(result.stn1Targets.pos1.rz).toBe(180);
    expect(result.stn2Targets.pos1.rx).toBe(30);
  });

  it('generates ABB RAPID code for Station 1 and Station 2', () => {
    const item = calculateWm18Item({
      diameterMm: 400,
      mofType: 'CB',
      series: 'EST',
      pressureClass: 'PN16',
      angleDeg: 45,
    });

    const rapidOutput = generateWm18RapidCode(item);

    expect(rapidOutput.stn1RapidCode).toContain('MODULE ProcesdataSTN1');
    expect(rapidOutput.stn1RapidCode).toContain('VAR robtarget pSt1_Pos1');
    expect(rapidOutput.stn1RapidCode).toContain('VAR num St1_WindingCycles:=');
    expect(rapidOutput.stn1RapidCode).toContain('ENDMODULE');

    expect(rapidOutput.stn2RapidCode).toContain('MODULE ProcesdataSTN2');
    expect(rapidOutput.stn2RapidCode).toContain('VAR robtarget pSt2_Pos1');
    expect(rapidOutput.stn2RapidCode).toContain('ENDMODULE');
  });
});
