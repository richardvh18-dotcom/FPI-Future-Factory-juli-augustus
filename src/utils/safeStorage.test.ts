import { beforeEach, describe, expect, it, vi } from 'vitest';

import { safeSetLocalStorage } from './safeStorage';

describe('safeSetLocalStorage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('retries after clearing related keys when quota is exceeded', () => {
    const originalSetItem = Storage.prototype.setItem;
    const originalRemoveItem = Storage.prototype.removeItem;
    let quotaCalls = 0;

    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
      if (key === 'usb_printer_serial' && quotaCalls === 0) {
        quotaCalls += 1;
        throw new DOMException('Quota exceeded', 'QuotaExceededError');
      }
      return originalSetItem.call(this, key, value);
    });

    const removeItemSpy = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(function (this: Storage, key: string) {
      return originalRemoveItem.call(this, key);
    });

    const result = safeSetLocalStorage('usb_printer_serial', 'serial-123', {
      cleanupKeys: ['usb_printer_id', 'print_station_printer_bindings_v1'],
    });

    expect(result).toBe(true);
    expect(localStorage.getItem('usb_printer_serial')).toBe('serial-123');
    expect(removeItemSpy).toHaveBeenCalledWith('usb_printer_id');

    setItemSpy.mockRestore();
    removeItemSpy.mockRestore();
  });
});
