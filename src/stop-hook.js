#!/usr/bin/env node
// agentwatch — Stop hook
// Shows a macOS notification with session summary when Claude Code exits

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const { assessRisk } = require('./risk');

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
    if (!sessionId || !/^[a-zA-Z0-9_-]+$/.test(sessionId)) process.exit(0);

    const logPath = path.join(SESSIONS_DIR, `${sessionId}.jsonl`);
    if (!fs.existsSync(logPath)) process.exit(0);

    const content = fs.readFileSync(logPath, 'utf8').trim();
    if (!content) process.exit(0);

    let actionCount = 0;
    let riskCount = 0;
    let criticalCount = 0;

    for (const line of content.split('\n')) {
      if (!line) continue;
      const entry = JSON.parse(line);
      if (entry.type === 'session_start') continue;
      actionCount++;
      const risks = assessRisk(entry);
      for (const r of risks) {
        riskCount++;
        if (r.level === 'critical') criticalCount++;
      }
    }

    if (actionCount === 0) process.exit(0);

    // Build notification
    const title = 'agentwatch: session ended';
    let body = `${actionCount} action${actionCount !== 1 ? 's' : ''}`;
    if (riskCount > 0) {
      body += `, ${riskCount} risk${riskCount !== 1 ? 's' : ''} detected — run agentwatch danger`;
    } else {
      body += ', no risks detected';
    }

    const sound = riskCount > 0 ? 'Funk' : 'Pop';
    notify(title, body, sound);
  } catch (e) {
    // Silent fail
  }
  process.exit(0);
});

function notify(title, body, sound) {
  if (process.platform === 'darwin') {
    const script = `display notification "${body.replace(/["\\]/g, ' ')}" with title "${title.replace(/["\\]/g, ' ')}" sound name "${sound}"`;
    try { execFileSync('osascript', ['-e', script], { timeout: 2000 }); } catch (e) {}
  }
}
