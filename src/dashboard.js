#!/usr/bin/env node
// agentwatch dashboard — local web UI at agentwatch.localhost:3737

const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { assessRisk } = require('./risk');
const { SESSIONS_DIR, isValidSessionId, buildIndex: _buildIndex } = require('./sessions');

const PORT = process.env.AGENTWATCH_PORT || 3737;
const HOST = process.env.AGENTWATCH_HOST || 'agentwatch.localhost';
const DASHBOARD_DIR = path.join(__dirname, '..', 'dashboard');

const MIME = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
};

// Index cache — rebuilt from JSONL files, cached with TTL
let indexCache = null;
let indexCacheTime = 0;
const INDEX_CACHE_TTL = 1500;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${HOST}:${PORT}`);

  if (url.pathname === '/api/sessions') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(loadIndex()));
    return;
  }

  if (url.pathname === '/api/session') {
    const id = url.searchParams.get('id');
    if (!id || !isValidSessionId(id)) {
      res.writeHead(400);
      res.end('Invalid session ID');
      return;
    }
    const logPath = path.join(SESSIONS_DIR, `${id}.jsonl`);
    try {
      const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n');
      const entries = lines.filter(Boolean).map(l => {
        const entry = JSON.parse(l);
        if (entry.type === 'session_start') return null;
        entry.risks = assessRisk(entry);
        return entry;
      }).filter(Boolean);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(entries));
    } catch (e) {
      res.writeHead(404);
      res.end('Session not found');
    }
    return;
  }

  // Serve static files from dashboard/
  let filePath = url.pathname === '/' ? '/index.html' : url.pathname;
  const ext = path.extname(filePath);
  const mime = MIME[ext];
  if (!mime) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  try {
    const fullPath = path.join(DASHBOARD_DIR, path.basename(filePath));
    const isBinary = ['.jpg', '.jpeg', '.png'].includes(ext);
    const content = fs.readFileSync(fullPath, isBinary ? undefined : 'utf8');
    res.writeHead(200, { 'Content-Type': mime });
    res.end(content);
  } catch (e) {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(PORT, HOST, () => {
  const dashUrl = `http://${HOST}:${PORT}`;
  console.log(`\n  agentwatch dashboard running at ${dashUrl}\n`);
  try {
    execSync(`open ${dashUrl}`);
  } catch (e) {
    try { execSync(`xdg-open ${dashUrl}`); } catch (e2) {}
  }
});

function loadIndex() {
  const now = Date.now();
  if (indexCache && now - indexCacheTime < INDEX_CACHE_TTL) return indexCache;
  indexCache = buildIndex();
  indexCacheTime = now;
  return indexCache;
}

function buildIndex() {
  return _buildIndex();
}
