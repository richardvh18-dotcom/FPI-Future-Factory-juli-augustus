import { addDoc, collection, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db, auth, logActivity } from '../config/firebase';
import { PATHS, getPathString } from '../config/dbPaths';

export type GatewayPcConfig = {
  host: string;
  port: number;
  scheme: 'http' | 'https';
  updatedAt?: string;
};

export type GatewayPcIntegrationStatus = {
  mode: 'prepared' | 'connected' | 'offline';
  repository: string;
  description: string;
  endpoint: string;
  capabilities: string[];
  readiness: 'ready-for-wiring' | 'active' | 'not-yet-active';
  lastCheckedAt?: string;
  lastError?: string;
};

type GatewayPcDispatchPayload = Record<string, unknown> & {
  jobId?: string;
  type?: string;
  printerId?: string;
  stationId?: string;
};

type GatewayPcDispatchResult = {
  ok: boolean;
  endpoint: string;
  status: string;
  message: string;
};

const DEFAULT_GATEWAY_ENDPOINT = 'http://localhost:3030/api/jobs';
const DEFAULT_GATEWAY_HEALTH_ENDPOINT = 'http://localhost:3030/health';
const GATEWAY_CONFIG_STORAGE_KEY = 'gatewayPcConfig';
const GATEWAY_CONFIG_DOC_PATH = getPathString(PATHS.SETTINGS?.length ? PATHS.SETTINGS : ['future-factory', 'settings', 'gateway_pc']);

const getGatewayBaseUrl = () => {
  if (typeof window !== 'undefined') {
    const configured = window.localStorage.getItem('gatewayPcEndpoint');
    if (configured) return configured.replace(/\/api\/jobs$/i, '');
  }
  return 'http://localhost:3030';
};

export const getGatewayPcIntegrationStatus = (): GatewayPcIntegrationStatus => {
  if (typeof window === 'undefined') {
    return {
      mode: 'offline',
      repository: 'richardvh18-dotcom/GatewayPC',
      description:
        'Voorbereide aansluiting voor een lokale Node.js gateway-pc in het fabrieksnetwerk. De bridge wordt nu actief getest vanuit de browser.',
      endpoint: DEFAULT_GATEWAY_HEALTH_ENDPOINT,
      capabilities: [
        'Job bridge voor PRINT en ROBOT',
        'Live healthcheck naar de lokale gateway',
        'Settings-sync voor printer en robot',
      ],
      readiness: 'ready-for-wiring',
      lastCheckedAt: new Date().toISOString(),
      lastError: 'Browser runtime is not available',
    };
  }

  return {
    mode: 'prepared',
    repository: 'richardvh18-dotcom/GatewayPC',
    description:
      'Voorbereide aansluiting voor een lokale Node.js gateway-pc in het fabrieksnetwerk. De bridge is nu actief getest vanuit de browser.',
    endpoint: DEFAULT_GATEWAY_HEALTH_ENDPOINT,
    capabilities: [
      'Job bridge voor PRINT en ROBOT',
      'Live healthcheck naar de lokale gateway',
      'Settings-sync voor printer en robot',
    ],
    readiness: 'ready-for-wiring',
  };
};

export const checkGatewayPcHealth = async (): Promise<GatewayPcIntegrationStatus> => {
  const baseUrl = getGatewayBaseUrl();
  const endpoint = `${baseUrl}/health`;

  try {
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`Healthcheck failed with status ${response.status}`);
    }

    const payload = await response.json().catch(() => ({}));
    const statusText = typeof payload?.status === 'string' ? payload.status : 'ok';

    return {
      mode: 'connected',
      repository: 'richardvh18-dotcom/GatewayPC',
      description:
        'Voorbereide aansluiting voor een lokale Node.js gateway-pc in het fabrieksnetwerk. De bridge is zichtbaar en reageert op healthchecks.',
      endpoint,
      capabilities: [
        'Job bridge voor PRINT en ROBOT',
        'Live healthcheck naar de lokale gateway',
        'Settings-sync voor printer en robot',
      ],
      readiness: 'active',
      lastCheckedAt: new Date().toISOString(),
      lastError: undefined,
    };
  } catch (error) {
    return {
      mode: 'offline',
      repository: 'richardvh18-dotcom/GatewayPC',
      description:
        'Voorbereide aansluiting voor een lokale Node.js gateway-pc in het fabrieksnetwerk. De bridge is zichtbaar, maar de lokale gateway reageert nog niet.',
      endpoint,
      capabilities: [
        'Job bridge voor PRINT en ROBOT',
        'Live healthcheck naar de lokale gateway',
        'Settings-sync voor printer en robot',
      ],
      readiness: 'ready-for-wiring',
      lastCheckedAt: new Date().toISOString(),
      lastError: error instanceof Error ? error.message : 'Gateway unreachable',
    };
  }
};

export const loadGatewayPcConfig = async (): Promise<GatewayPcConfig> => {
  if (typeof window !== 'undefined') {
    const stored = window.localStorage.getItem(GATEWAY_CONFIG_STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as GatewayPcConfig;
        if (parsed?.host) {
          return { host: parsed.host, port: parsed.port || 3030, scheme: parsed.scheme || 'http' };
        }
      } catch {
        // Ignore invalid cache entry
      }
    }
  }

  try {
    const snap = await getDoc(doc(db, 'future-factory/settings/gateway_pc/main'));
    if (snap.exists()) {
      const data = snap.data() as Partial<GatewayPcConfig>;
      return {
        host: String(data.host || ''),
        port: Number(data.port || 3030),
        scheme: data.scheme === 'https' ? 'https' : 'http',
        updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : undefined,
      };
    }
  } catch {
    // Fall back to local defaults
  }

  return { host: '', port: 3030, scheme: 'http' };
};

export const saveGatewayPcConfig = async (config: GatewayPcConfig): Promise<GatewayPcConfig> => {
  const normalized: GatewayPcConfig = {
    host: String(config.host || '').trim(),
    port: Number(config.port || 3030),
    scheme: config.scheme === 'https' ? 'https' : 'http',
    updatedAt: new Date().toISOString(),
  };

  if (typeof window !== 'undefined') {
    window.localStorage.setItem(GATEWAY_CONFIG_STORAGE_KEY, JSON.stringify(normalized));
  }

  await setDoc(doc(db, 'future-factory/settings/gateway_pc/main'), normalized, { merge: true });
  return normalized;
};

export const enqueueGatewayPcJob = async (type: string, payload: GatewayPcDispatchPayload = {}) => {
  const currentUserId = auth.currentUser?.uid || 'unknown';
  const config = await loadGatewayPcConfig();
  const preparedPayload = {
    ...payload,
    type,
    gatewayHost: config.host,
    gatewayPort: config.port,
    gatewayScheme: config.scheme,
    createdBy: currentUserId,
    createdAt: new Date().toISOString(),
    status: 'prepared',
  };

  const docRef = await addDoc(collection(db, 'future-factory/settings/gateway_pc/jobs'), preparedPayload);
  return docRef.id;
};

export const dispatchGatewayPcJob = async (
  type: string,
  payload: GatewayPcDispatchPayload = {},
): Promise<GatewayPcDispatchResult> => {
  const baseUrl = getGatewayBaseUrl();
  const endpoint = `${baseUrl}/api/jobs`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ type, ...payload }),
  });

  if (!response.ok) {
    const message = `Gateway dispatch failed with status ${response.status}`;
    return { ok: false, endpoint, status: 'error', message };
  }

  const data = await response.json().catch(() => ({}));
  return {
    ok: true,
    endpoint,
    status: typeof data?.status === 'string' ? data.status : 'accepted',
    message: typeof data?.message === 'string' ? data.message : 'Gateway job accepted',
  };
};
