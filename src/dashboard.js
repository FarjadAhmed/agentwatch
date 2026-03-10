#!/usr/bin/env node
// agentwatch dashboard — local web UI at localhost:3737

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const { assessRisk } = require('./risk');

const PORT = process.env.AGENTWATCH_PORT || 3737;
const AGENTWATCH_DIR = path.join(os.homedir(), '.agentwatch');
const SESSIONS_DIR = path.join(AGENTWATCH_DIR, 'sessions');
const DASHBOARD_DIR = path.join(__dirname, '..', 'dashboard');

const MIME = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
};

// Index cache — rebuilt from JSONL files, cached with TTL
let indexCache = null;
let indexCacheTime = 0;
const INDEX_CACHE_TTL = 1500;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === '/api/sessions') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(loadIndex()));
    return;
  }

  if (url.pathname === '/api/session') {
    const id = url.searchParams.get('id');
    if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) {
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
    const content = fs.readFileSync(fullPath, 'utf8');
    res.writeHead(200, { 'Content-Type': mime });
    res.end(content);
  } catch (e) {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(PORT, () => {
  console.log(`\n  agentwatch dashboard running at http://localhost:${PORT}\n`);
  try {
    execSync(`open http://localhost:${PORT}`);
  } catch (e) {
    try { execSync(`xdg-open http://localhost:${PORT}`); } catch (e2) {}
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
  const index = {};
  let files;
  try {
    files = fs.readdirSync(SESSIONS_DIR).filter(f => f.endsWith('.jsonl'));
  } catch (e) {
    return index;
  }

  for (const file of files) {
    const id = path.basename(file, '.jsonl');
    const filePath = path.join(SESSIONS_DIR, file);
    try {
      const content = fs.readFileSync(filePath, 'utf8').trim();
      if (!content) continue;

      let started = null, cwd = null, model = null;
      let toolCount = 0;
      const toolsUsed = {};
      const filesTouched = new Set();
      let commandsRun = 0;
      let lastActivity = null;

      for (const line of content.split('\n')) {
        if (!line) continue;
        const entry = JSON.parse(line);
        if (entry.type === 'session_start') {
          started = entry.timestamp;
          cwd = entry.cwd;
          model = entry.model;
          continue;
        }
        toolCount++;
        toolsUsed[entry.tool] = (toolsUsed[entry.tool] || 0) + 1;
        if (entry.file) filesTouched.add(entry.file);
        if (entry.tool === 'Bash') commandsRun++;
        lastActivity = entry.timestamp;
        if (!started) started = entry.timestamp;
      }

      index[id] = {
        started,
        cwd,
        model,
        tool_count: toolCount,
        tools_used: toolsUsed,
        files_touched: [...filesTouched],
        commands_run: commandsRun,
        last_activity: lastActivity,
      };
    } catch (e) {
      // Skip corrupted files
    }
  }

  return index;
}
