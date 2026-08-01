import { describe, expect, it } from 'vitest';

import { buildBh18RobotProgramPreparation } from '../src/services/robotProgramService';

describe('buildBh18RobotProgramPreparation', () => {
  it('adds robot position and station metadata for BH18 workflows', () => {
    const preparation = buildBh18RobotProgramPreparation({
      orderId: 'ORD-1001',
      lotNumber: '4001234500010001',
      stationId: 'BH18',
      robotPosition: 2,
      diameterMm: 160,
      pressureClass: 'PN16',
      notes: 'Test launch',
    });

    expect(preparation.status).toBe('ready-for-gateway');
    expect(preparation.destinationFolder).toBe('robot_programs/ftp_upload');
    expect(preparation.robotPosition).toBe(2);
    expect(preparation.stationId).toBe('BH18');
    expect(preparation.orderId).toBe('ORD-1001');
    expect(preparation.lotNumber).toBe('4001234500010001');
  });
});
