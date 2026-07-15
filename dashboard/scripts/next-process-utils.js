'use strict';

/**
 * next-process-utils.js — Nhận diện & dừng Next runtime THUỘC dashboard workspace.
 *
 * Mục tiêu: chống dev/build/start chạy chồng làm hỏng `.next`
 * (vendor-chunks / webpack-runtime / `_next/static` 404).
 *
 * Nguyên tắc an toàn:
 * - Chỉ Node core, không dependency.
 * - Chỉ coi là "workspace Next runtime" khi command line chứa ĐÚNG đường dẫn
 *   dashboard workspace (process.cwd()/..) + marker Next (next dev/start/next-server/
 *   start-server.js/next/dist). Không match process ngoài workspace.
 * - Không match chính process đang chạy script.
 * - Khi không chắc chắn thuộc workspace → KHÔNG kill, báo "suspicious".
 * - Cross-platform: Windows (PowerShell CIM) + Unix (ps).
 */
const { spawnSync } = require('child_process');
const path = require('path');

const DASHBOARD_ROOT = path.resolve(__dirname, '..');

function norm(s) {
  return String(s || '').replace(/\\/g, '/').toLowerCase();
}

const DASHBOARD_ROOT_NORM = norm(DASHBOARD_ROOT);
const NEXT_MARKER = /(next[\/\\ ]dist|next-server|start-server\.js|[\/\\ ]next[\/\\ ].*(dev|start)|\bnext\b.*\b(dev|start)\b)/i;

/**
 * Trả về danh sách tiến trình node thô: [{ pid, cmd }]. Cross-platform.
 */
function listNodeProcesses() {
  if (process.platform === 'win32') {
    const ps =
      "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | " +
      'Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress';
    const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], {
      encoding: 'utf8',
    });
    if (r.status !== 0 || !r.stdout) return [];
    let parsed;
    try {
      parsed = JSON.parse(r.stdout);
    } catch (_) {
      return [];
    }
    const arr = Array.isArray(parsed) ? parsed : [parsed];
    return arr
      .filter((p) => p && p.ProcessId)
      .map((p) => ({ pid: Number(p.ProcessId), cmd: p.CommandLine || '' }));
  }

  // Unix: ps -eo pid,args
  const r = spawnSync('ps', ['-eo', 'pid=,args='], { encoding: 'utf8' });
  if (r.status !== 0 || !r.stdout) return [];
  return r.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const m = line.match(/^(\d+)\s+(.*)$/);
      if (!m) return null;
      return { pid: Number(m[1]), cmd: m[2] };
    })
    .filter((p) => p && /node/i.test(p.cmd));
}

/**
 * Phân loại tiến trình Next:
 * - certain: cmd chứa dashboard workspace path + Next marker (chắc chắn thuộc workspace).
 * - suspicious: cmd có Next marker nhưng KHÔNG chứa workspace path (không chắc).
 * Loại trừ chính process hiện tại.
 */
function classifyNextProcesses() {
  const self = process.pid;
  const certain = [];
  const suspicious = [];
  for (const proc of listNodeProcesses()) {
    if (proc.pid === self) continue;
    const cmdNorm = norm(proc.cmd);
    if (!NEXT_MARKER.test(proc.cmd)) continue;
    if (cmdNorm.includes(DASHBOARD_ROOT_NORM)) {
      certain.push(proc);
    } else {
      suspicious.push(proc);
    }
  }
  return { certain, suspicious };
}

/**
 * Chỉ Next runtime chắc chắn thuộc workspace dashboard.
 */
function listNextRuntimeProcesses() {
  return classifyNextProcesses().certain;
}

function killPid(pid) {
  if (process.platform === 'win32') {
    const r = spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { encoding: 'utf8' });
    return r.status === 0;
  }
  try {
    process.kill(pid, 'SIGKILL');
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * Dừng toàn bộ Next runtime thuộc workspace. Trả về { stopped: [...], suspicious: [...] }.
 */
function stopNextRuntimeProcesses() {
  const { certain, suspicious } = classifyNextProcesses();
  const stopped = [];
  for (const proc of certain) {
    const ok = killPid(proc.pid);
    stopped.push({ pid: proc.pid, cmd: shortCmd(proc.cmd), killed: ok });
    console.log(`[next-runtime] stop pid=${proc.pid} killed=${ok} :: ${shortCmd(proc.cmd)}`);
  }
  return { stopped, suspicious };
}

/**
 * Throw nếu còn Next runtime thuộc workspace (certain) hoặc process nghi ngờ (suspicious).
 */
function assertNoNextRuntimeProcesses() {
  const { certain, suspicious } = classifyNextProcesses();
  if (certain.length > 0) {
    const list = certain.map((p) => `pid=${p.pid} :: ${shortCmd(p.cmd)}`).join('\n  ');
    const err = new Error(`Next runtime thuộc workspace đang chạy:\n  ${list}`);
    err.code = 'NEXT_RUNTIME_ACTIVE';
    throw err;
  }
  if (suspicious.length > 0) {
    const list = suspicious.map((p) => `pid=${p.pid} :: ${shortCmd(p.cmd)}`).join('\n  ');
    const err = new Error(`Phát hiện Next process nghi ngờ (không chắc thuộc workspace, không tự kill):\n  ${list}`);
    err.code = 'NEXT_RUNTIME_SUSPICIOUS';
    throw err;
  }
}

function shortCmd(cmd) {
  const s = String(cmd || '').replace(/\s+/g, ' ').trim();
  return s.length > 120 ? s.slice(0, 117) + '...' : s;
}

module.exports = {
  DASHBOARD_ROOT,
  listNextRuntimeProcesses,
  stopNextRuntimeProcesses,
  assertNoNextRuntimeProcesses,
  classifyNextProcesses,
};
