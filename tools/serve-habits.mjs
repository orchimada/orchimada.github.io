#!/usr/bin/env node
/**
 * serve-habits.mjs — the live local dashboard.
 *
 *   node tools/serve-habits.mjs            # http://localhost:8765/habits.html
 *
 * Real time without a build step: /habits.json is not read from disk — it is
 * parsed FRESH from the vault's frontmatter on every request (ten files parse
 * in about a millisecond, so there is nothing to cache). /events is a
 * server-sent-events stream that fires whenever a daily note is saved;
 * habits.html listens to it when served from localhost and re-renders.
 * Tick a checkbox in Obsidian, the dashboard is current before you tab over.
 *
 * Local only: binds 127.0.0.1, serves nothing to the network.
 * HABITS_VAULT / HABITS_PORT override the defaults.
 */

import { createServer } from 'node:http';
import { watch, readFileSync, statSync } from 'node:fs';
import { join, normalize, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { payload, DEFAULT_VAULT } from './habits-lib.mjs';

const VAULT = process.env.HABITS_VAULT ?? DEFAULT_VAULT;
const PORT = Number(process.env.HABITS_PORT) || 8765;
const ROOT = fileURLToPath(new URL('..', import.meta.url));

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

// ── SSE: one broadcast per save, debounced against editor/iCloud churn ──────
const clients = new Set();
let timer = null;
function broadcast() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    for (const res of clients) res.write(`data: change ${Date.now()}\n\n`);
  }, 250);
}
try {
  watch(VAULT, broadcast);
} catch (e) {
  console.error(`Cannot watch ${VAULT} (${e.message}) — live refresh off, manual reload still works.`);
}

// ── the server ──────────────────────────────────────────────────────────────
createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);

  if (path === '/habits.json') {
    try {
      res.writeHead(200, { 'Content-Type': TYPES['.json'], 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(payload(VAULT)));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('vault unreadable: ' + e.message);
    }
    return;
  }

  if (path === '/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive',
    });
    res.write(': connected\n\n');
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }

  // static files from the repo root
  const rel = path === '/' ? 'habits.html' : path.slice(1);
  const file = normalize(join(ROOT, rel));
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  try {
    if (!statSync(file).isFile()) throw new Error('dir');
    res.writeHead(200, {
      'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(readFileSync(file));
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('not found');
  }
}).listen(PORT, '127.0.0.1', () => {
  console.log(`habits · live from the vault\n→ http://localhost:${PORT}/habits.html\nwatching ${VAULT}`);
});
