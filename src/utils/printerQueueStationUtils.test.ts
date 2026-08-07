import { describe, it, expect } from 'vitest';
import { resolvePreferredQueueDepartment } from './printerQueueStationUtils';

describe('resolvePreferredQueueDepartment', () => {
  it('matches a printer name to a department such as Lossen', () => {
    const result = resolvePreferredQueueDepartment({
      printer: { name: 'Lighthouse Lossen' },
      availableDepartments: ['BH11', 'BH31', 'Lossen'],
    });

    expect(result).toBe('Lossen');
  });

  it('prefers an explicit printer department when present', () => {
    const result = resolvePreferredQueueDepartment({
      printer: { department: 'BH31' },
      availableDepartments: ['BH11', 'BH31', 'Lossen'],
    });

    expect(result).toBe('BH31');
  });
});
