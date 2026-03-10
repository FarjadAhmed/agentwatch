#!/usr/bin/env node
// agentwatch — SessionStart hook
// Records session metadata as first entry in the session JSONL file

const fs = require('fs');
const path = require('path');
const os = require('os');

const SESSIONS_DIR = path.join(os.homedir(), '.agentwatch', 'sessions');

let input = '';
const timeout = setTimeout(() => process.exit(0), 3000);

process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => {
  clearTimeout(timeout);
  try {
    const data = JSON.parse(input);
    const sessionId = data.session_id;
    if (!sessionId) process.exit(0);

    fs.mkdirSync(SESSIONS_DIR, { recursive: true });

    const logPath = path.join(SESSIONS_DIR, `${sessionId}.jsonl`);
    const entry = {
      type: 'session_start',
      timestamp: new Date().toISOString(),
      cwd: data.cwd,
      model: data.model || null,
      source: data.source || null,
      permission_mode: data.permission_mode || null,
    };

    fs.appendFileSync(logPath, JSON.stringify(entry) + '\n');
  } catch (e) {
    // Silent fail
  }
  process.exit(0);
});
