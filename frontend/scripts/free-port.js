#!/usr/bin/env node
/**
 * Free a TCP port before starting Vite (Windows + Unix).
 * Usage: node scripts/free-port.js [port]
 */
import { execSync } from 'node:child_process';
import process from 'node:process';

const port = Number(process.argv[2] || 3000);
if (!Number.isFinite(port) || port <= 0) {
  console.error(`Invalid port: ${process.argv[2]}`);
  process.exit(1);
}

function uniquePids(pids) {
  return [...new Set(pids.map(String).filter((p) => p && p !== '0' && p !== process.pid.toString()))];
}

function pidsWindows(p) {
  try {
    const out = execSync(`netstat -ano`, { encoding: 'utf8' });
    const pids = [];
    for (const line of out.split(/\r?\n/)) {
      if (!line.includes('LISTENING')) continue;
      // Match :3000 or :3000] in IPv4/IPv6 local address column
      if (!new RegExp(`:${p}(\\s|])`).test(line) && !line.includes(`:${p} `)) continue;
      if (!line.includes(`:${p}`)) continue;
      const m = line.trim().match(/(\d+)\s*$/);
      if (m) pids.push(m[1]);
    }
    return uniquePids(pids);
  } catch {
    return [];
  }
}

function pidsUnix(p) {
  try {
    const out = execSync(`lsof -tiTCP:${p} -sTCP:LISTEN`, { encoding: 'utf8' });
    return uniquePids(out.split(/\s+/).filter(Boolean));
  } catch {
    return [];
  }
}

const isWin = process.platform === 'win32';
const pids = isWin ? pidsWindows(port) : pidsUnix(port);

if (pids.length === 0) {
  console.log(`[free-port] :${port} is free`);
  process.exit(0);
}

for (const pid of pids) {
  try {
    if (isWin) {
      execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
    } else {
      execSync(`kill -9 ${pid}`, { stdio: 'ignore' });
    }
    console.log(`[free-port] killed PID ${pid} on :${port}`);
  } catch (err) {
    console.warn(`[free-port] could not kill PID ${pid}:`, err.message || err);
  }
}

process.exit(0);
