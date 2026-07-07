const crypto = require('crypto');
const ALGORITHM = 'aes-256-gcm';

function getKey() {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex) throw new Error('ENCRYPTION_KEY env var not set. Generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
  const key = Buffer.from(hex, 'hex');
  if (key.length !== 32) throw new Error('ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes)');
  return key;
}

// Returns "ivHex:tagHex:ctHex"
function encrypt(plaintext) {
  if (!plaintext) throw new Error('Cannot encrypt empty value');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${ct.toString('hex')}`;
}

function decrypt(ciphertext) {
  if (!ciphertext) throw new Error('Cannot decrypt empty value');
  const parts = ciphertext.split(':');
  if (parts.length !== 3) throw new Error('Invalid encrypted value format');
  const [ivHex, tagHex, ctHex] = parts;
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(ctHex, 'hex')), decipher.final()]).toString('utf8');
}

// Null-safe: skip null/undefined
function encryptIfPresent(value) {
  return value ? encrypt(value) : null;
}

function decryptIfPresent(value) {
  return value ? decrypt(value) : null;
}

// Validate HMAC-SHA256 signature from Chatwoot
// Chatwoot signs: HMAC-SHA256("${timestamp}.${body}", secret)
// Headers: X-Chatwoot-Signature: sha256=<hex>, X-Chatwoot-Timestamp: <unix_ts>
function validateWebhookSignature(rawBody, signatureHeader, secret, timestamp) {
  if (!secret) return true; // No secret configured → accept all
  if (!signatureHeader) return false;

  // Chatwoot signs "timestamp.body" when timestamp header is present
  const payload = timestamp ? `${timestamp}.${rawBody.toString('utf8')}` : rawBody;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  const received = signatureHeader.replace(/^sha256=/, '');

  try {
    const expBuf = Buffer.from(expected, 'hex');
    const recBuf = Buffer.from(received, 'hex');
    if (expBuf.length !== recBuf.length) return false;
    return crypto.timingSafeEqual(expBuf, recBuf);
  } catch {
    return false;
  }
}

module.exports = { encrypt, decrypt, encryptIfPresent, decryptIfPresent, validateWebhookSignature };
