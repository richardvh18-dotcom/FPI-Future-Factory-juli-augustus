import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.fn();

vi.stubGlobal('fetch', fetchMock);

describe('gatewayPcService', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it('posts a print job to the local gateway endpoint when available', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'ok', service: 'gateway-pc' }),
    });

    const { dispatchGatewayPcJob } = await import('../src/services/gatewayPcService');

    const result = await dispatchGatewayPcJob('print', {
      jobId: 'job-123',
      printerId: 'BH18-ZEBRA',
    });

    expect(result.ok).toBe(true);
    expect(result.endpoint).toContain('/api/jobs');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
