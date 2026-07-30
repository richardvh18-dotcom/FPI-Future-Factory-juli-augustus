export type LocalWm18ImportRecord = {
  id: string;
  fileName: string;
  storagePath: string;
  source: string;
  notes?: string;
  category?: string;
  fileDataUri?: string;
  uploadedBy?: string;
  uploadedAt?: string;
  wm18Definition?: Record<string, unknown>;
  robotPrep?: Record<string, unknown>;
  storageUploadFailed?: boolean;
};

const STORAGE_KEY = 'fpi_wm18_imports_local';

export const buildWm18ImportDocumentId = (fileName: string): string => {
  const normalized = fileName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return `wm18-import-${normalized || 'upload'}-${suffix}`;
};

const getErrorCode = (error: unknown): string => {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    return String((error as { code?: unknown }).code || '');
  }
  return '';
};

const getErrorMessage = (error: unknown): string => {
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String((error as { message?: unknown }).message || '');
  }
  return '';
};

const readLocalImports = (): LocalWm18ImportRecord[] => {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeLocalImports = (records: LocalWm18ImportRecord[]) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch {
    // ignore storage quota issues
  }
};

export const isWm18StorageFallbackError = (error: unknown): boolean => {
  const normalized = `${getErrorCode(error)} ${getErrorMessage(error)}`.toLowerCase();
  if (!normalized) return false;

  return (
    normalized.includes('storage/') ||
    normalized.includes('user does not have permission') ||
    normalized.includes('quota') ||
    normalized.includes('network') ||
    normalized.includes('upload failed') ||
    normalized.includes('failed to upload')
  );
};

export const buildLocalWm18ImportRecord = ({
  fileName,
  storagePath,
  notes,
  category,
  fileDataUri,
  uploadedBy,
  wm18Definition,
  robotPrep,
}: {
  fileName: string;
  storagePath: string;
  notes?: string;
  category?: string;
  fileDataUri?: string;
  uploadedBy?: string;
  wm18Definition?: Record<string, unknown>;
  robotPrep?: Record<string, unknown>;
}): LocalWm18ImportRecord => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  fileName,
  storagePath,
  source: 'wm18-robot-import-local',
  notes: notes?.trim() || 'Lokaal opgeslagen WM18-import',
  category,
  fileDataUri: undefined,
  uploadedBy,
  uploadedAt: new Date().toISOString(),
  wm18Definition,
  robotPrep,
  storageUploadFailed: true,
});

export const saveLocalWm18Import = async (record: LocalWm18ImportRecord) => {
  const next = [record, ...readLocalImports().filter((item) => item.id !== record.id)];
  writeLocalImports(next);
  return record;
};

export const loadLocalWm18Imports = async (): Promise<LocalWm18ImportRecord[]> => readLocalImports();

export const removeLocalWm18Import = async (id: string) => {
  const next = readLocalImports().filter((item) => item.id !== id);
  writeLocalImports(next);
  return next;
};
