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

module.exports = {
  getEnv,
  getRequiredEnv,
  isProduction,
};
