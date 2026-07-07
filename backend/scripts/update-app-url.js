// Cập nhật APP_BASE_URL trong backend/.env
// Usage: node update-app-url.js <NEW_URL>
const fs = require('fs');
const path = require('path');

const newUrl = process.argv[2];
if (!newUrl) {
  process.exit(1);
}

const envPath = path.join(__dirname, '..', '.env');
try {
  let content = fs.readFileSync(envPath, 'utf8');
  if (/^APP_BASE_URL=.*/m.test(content)) {
    content = content.replace(/^APP_BASE_URL=.*/m, `APP_BASE_URL=${newUrl}`);
  } else {
    content += `\nAPP_BASE_URL=${newUrl}`;
  }
  fs.writeFileSync(envPath, content);
  console.log('  - Da cap nhat APP_BASE_URL=' + newUrl);
} catch (e) {
  console.error('  [LOI] Khong the cap nhat .env:', e.message);
  process.exit(1);
}
