require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { decrypt } = require('../src/chatwoot/crypto');

const encrypted = "fa93ceefef520f464628c17e:ded589606009c3d7d07e5da9df1eb3a9:a66cfa3f8b597a31fd9481a3b3ae89cda3e3c56eb0a727c3";

try {
  const decrypted = decrypt(encrypted);
  console.log('Decrypted token:', decrypted);
  console.log('Match env:', decrypted === process.env.CHATWOOT_API_TOKEN);
} catch (e) {
  console.log('Lỗi giải mã:', e.message);
}
