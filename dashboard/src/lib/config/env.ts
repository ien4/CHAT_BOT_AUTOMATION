const LOCAL_BACKEND_BASE_URL = 'http://localhost:3001';
const LOCAL_CHATWOOT_BASE_URL = 'http://localhost:3000';

export function normalizeBaseUrl(value?: string) {
  const normalized = value?.trim().replace(/\/+$/, '');
  return normalized || undefined;
}

function stripApiSuffix(value: string) {
  return value.replace(/\/api\/?$/, '');
}

const configuredApiUrl = normalizeBaseUrl(process.env.NEXT_PUBLIC_API_URL);

export const API_BASE_API_URL = configuredApiUrl || `${LOCAL_BACKEND_BASE_URL}/api`;
export const API_BASE_URL = stripApiSuffix(API_BASE_API_URL);
export const CHATWOOT_BASE_URL =
  normalizeBaseUrl(process.env.NEXT_PUBLIC_CHATWOOT_URL) || LOCAL_CHATWOOT_BASE_URL;

export function buildBackendUrl(path: string) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
}

export function buildApiUrl(path: string) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_API_URL}${normalizedPath}`;
}
