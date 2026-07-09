const DEFAULT_BACKEND_PORT = '3001';
const DEFAULT_DASHBOARD_BASE_URL = 'http://localhost:3000';
const LOCAL_BACKEND_HOST = 'http://localhost';

function getEnv(name, fallback) {
  const value = process.env[name];
  if (value === undefined || value === '') {
    return fallback;
  }
  return value;
}

function getRequiredEnv(name) {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function isProduction() {
  return process.env.NODE_ENV === 'production';
}

function isDevelopment() {
  return process.env.NODE_ENV === 'development' || process.env.NODE_ENV === undefined || process.env.NODE_ENV === '';
}

function isTest() {
  return process.env.NODE_ENV === 'test';
}

function normalizeBaseUrl(value) {
  if (value === undefined || value === null) {
    return undefined;
  }

  const normalized = String(value).trim().replace(/\/+$/, '');
  return normalized || undefined;
}

function getBackendPort() {
  return String(getEnv('PORT', DEFAULT_BACKEND_PORT));
}

function getAppBaseUrl() {
  const configuredBaseUrl = normalizeBaseUrl(getEnv('APP_BASE_URL'));
  if (configuredBaseUrl) {
    return configuredBaseUrl;
  }

  if (!isProduction()) {
    return `${LOCAL_BACKEND_HOST}:${getBackendPort()}`;
  }

  return undefined;
}

function getDashboardBaseUrl() {
  return (
    normalizeBaseUrl(getEnv('DASHBOARD_URL')) ||
    normalizeBaseUrl(getEnv('FRONTEND_URL')) ||
    DEFAULT_DASHBOARD_BASE_URL
  );
}

function isPlaceholderSecret(value) {
  if (value === undefined || value === null) {
    return true;
  }

  const normalized = String(value).trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  return [
    'placeholder',
    'change-me',
    'changeme',
    'secret',
    'admin123',
    'password',
    'your-secret',
    'your-token',
    'your-api-key',
    'your-password',
  ].some((placeholder) => normalized.includes(placeholder));
}

function getPlaceholderConfigWarnings(env = process.env) {
  return [
    'ENCRYPTION_KEY',
    'JWT_SECRET',
    'FB_PAGE_ACCESS_TOKEN',
    'FB_VERIFY_TOKEN',
    'FB_APP_SECRET',
    'GEMINI_API_KEY',
    'DEEPSEEK_API_KEY',
    'CLAUDE_API_KEY',
    'TELEGRAM_BOT_TOKEN',
    'TELEGRAM_MANAGER_CHAT_ID',
    'TELEGRAM_STATUS_GROUP_ID',
    'ADMIN_PASSWORD',
    'POSTGRES_PASSWORD',
  ]
    .filter((name) => isPlaceholderSecret(env[name]))
    .map((name) => ({
      name,
      reason: 'missing-or-placeholder',
    }));
}

function warnIfPlaceholderConfig(logger = console.warn) {
  const warnings = getPlaceholderConfigWarnings();
  warnings.forEach(({ name, reason }) => {
    logger(`Config warning: ${name} is ${reason}`);
  });
  return warnings;
}

module.exports = {
  getAppBaseUrl,
  getBackendPort,
  getDashboardBaseUrl,
  getEnv,
  getPlaceholderConfigWarnings,
  getRequiredEnv,
  isDevelopment,
  isPlaceholderSecret,
  isProduction,
  isTest,
  normalizeBaseUrl,
  warnIfPlaceholderConfig,
};
