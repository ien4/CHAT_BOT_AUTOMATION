const LOCAL_BACKEND_BASE_URL = 'http://localhost:3001';

const configuredApiUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, '');

export const API_BASE_API_URL = configuredApiUrl || `${LOCAL_BACKEND_BASE_URL}/api`;
export const API_BASE_URL = API_BASE_API_URL.replace(/\/api\/?$/, '');
export const CHATWOOT_BASE_URL =
  process.env.NEXT_PUBLIC_CHATWOOT_URL || 'http://localhost:3000';

export function buildBackendUrl(path: string) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
}
