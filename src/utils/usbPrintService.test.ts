import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { doesUsbDeviceMatchPrinter, resolveUsbDeviceForPrinter } from './usbPrintService';

describe('doesUsbDeviceMatchPrinter', () => {
  it('accepts a device when vendor and product match even if the serial differs', () => {
    expect(
      doesUsbDeviceMatchPrinter(
        { vendorId: 0x0483, productId: 0x7540, serialNumber: 'DEVICE-ABC' },
        { vendorId: 0x0483, productId: 0x7540, usbSerialNumber: 'CONFIG-SERIAL' }
      )
    ).toBe(true);
  });

  it('rejects a device when vendor or product differ', () => {
    expect(
      doesUsbDeviceMatchPrinter(
        { vendorId: 0x1234, productId: 0x5678, serialNumber: 'DEVICE-ABC' },
        { vendorId: 0x0483, productId: 0x7540, usbSerialNumber: 'CONFIG-SERIAL' }
      )
    ).toBe(false);
  });
});

describe('resolveUsbDeviceForPrinter', () => {
  const originalUsb = navigator.usb;
  const originalSecureContext = window.isSecureContext;

  beforeEach(() => {
    Object.defineProperty(window, 'isSecureContext', {
      configurable: true,
      value: true,
    });
    Object.defineProperty(navigator, 'usb', {
      configurable: true,
      value: {
        getDevices: vi.fn().mockResolvedValue([]),
        requestDevice: vi.fn(),
      },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'isSecureContext', {
      configurable: true,
      value: originalSecureContext,
    });
    Object.defineProperty(navigator, 'usb', {
      configurable: true,
      value: originalUsb,
    });
  });

  it('uses the only authorized device when no exact match exists', async () => {
    const onlyDevice = { vendorId: 0x1234, productId: 0x5678, serialNumber: 'ONLY-DEVICE' } as USBDevice;
    vi.mocked(navigator.usb.getDevices).mockResolvedValue([onlyDevice]);

    const resolved = await resolveUsbDeviceForPrinter({ vendorId: 0x9999, productId: 0x8888 });

    expect(resolved).toBe(onlyDevice);
  });

  it('falls back to the current device when no authorized match is available', async () => {
    const currentDevice = { vendorId: 0x1234, productId: 0x5678, serialNumber: 'CURRENT-DEVICE' } as USBDevice;
    vi.mocked(navigator.usb.getDevices).mockResolvedValue([]);

    const resolved = await resolveUsbDeviceForPrinter({ vendorId: 0x1234, productId: 0x5678 }, currentDevice);

    expect(resolved).toBe(currentDevice);
  });

  it('falls back to the current device when a serial is configured but the device already matches by vendor and product', async () => {
    const currentDevice = { vendorId: 0x1234, productId: 0x5678, serialNumber: 'CURRENT-DEVICE' } as USBDevice;
    vi.mocked(navigator.usb.getDevices).mockResolvedValue([]);

    const resolved = await resolveUsbDeviceForPrinter(
      { vendorId: 0x1234, productId: 0x5678, usbSerialNumber: 'EXPECTED-SERIAL' },
      currentDevice
    );

    expect(resolved).toBe(currentDevice);
  });
});
