export type SafeLocalStorageOptions = {
  cleanupKeys?: string[];
};

export const safeSetLocalStorage = (
  key: string,
  value: string,
  options: SafeLocalStorageOptions = {}
): boolean => {
  if (!key || typeof value !== 'string') return false;

  try {
    const current = localStorage.getItem(key);
    if (current === value) return true;
    localStorage.setItem(key, value);
    return true;
  } catch (error) {
    const message = String(error || '').toLowerCase();
    const isQuotaError = message.includes('quota') || message.includes('exceeded');

    if (isQuotaError) {
      const cleanupKeys = Array.isArray(options.cleanupKeys) ? options.cleanupKeys : [];
      for (const cleanupKey of cleanupKeys) {
        try {
          localStorage.removeItem(cleanupKey);
        } catch {
          // Ignore cleanup failures.
        }
      }

      try {
        const current = localStorage.getItem(key);
        if (current === value) return true;
        localStorage.setItem(key, value);
        return true;
      } catch (retryError) {
        console.warn(`[safeStorage] localStorage write still failed after cleanup for ${key}:`, retryError);
      }
    }

    console.warn(`[safeStorage] localStorage setItem mislukt voor ${key}:`, error);
    return false;
  }
};
