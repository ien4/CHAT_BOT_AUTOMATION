#!/usr/bin/env node
'use strict';

/**
 * clean-next.js — Xóa an toàn thư mục `.next` của dashboard workspace để loại bỏ
 * stale/mixed Next build cache (nguyên nhân MODULE_NOT_FOUND / missing page.js /
 * `_next/static` 404 / `/dashboard` 500).
 *
 * - Chỉ Node core module, không dependency.
 * - Chỉ xóa `.next` NẰM TRONG chính dashboard workspace (verify bằng package.json).
 * - Không kill process, không đọc env/secret, không ghi log ra file tracked.
 */
const fs = require('fs');
const path = require('path');

const dashboardRoot = path.resolve(__dirname, '..');
const pkgPath = path.join(dashboardRoot, 'package.json');

function assertDashboardWorkspace() {
  if (!fs.existsSync(pkgPath)) {
    console.error(`[clean:next] Không tìm thấy package.json tại ${dashboardRoot}. Hủy.`);
    process.exit(1);
  }
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  if (pkg.name !== 'fb-chatbot-dashboard') {
    console.error(`[clean:next] package.json không phải dashboard workspace (name=${pkg.name}). Hủy.`);
    process.exit(1);
  }
}

function removeNextDir() {
  const nextDir = path.join(dashboardRoot, '.next');
  if (!fs.existsSync(nextDir)) {
    console.log('[clean:next] .next không tồn tại, không cần xóa.');
    return;
  }
  fs.rmSync(nextDir, { recursive: true, force: true });
  if (fs.existsSync(nextDir)) {
    console.error('[clean:next] Không xóa được .next (file đang bị process giữ?). Dừng dev server cũ rồi thử lại.');
    process.exit(1);
  }
  console.log('[clean:next] Đã xóa dashboard/.next.');
}

assertDashboardWorkspace();
removeNextDir();
console.log('[clean:next] Xong. Chạy `npm run dev` để start dashboard sạch trên 127.0.0.1:3019.');
