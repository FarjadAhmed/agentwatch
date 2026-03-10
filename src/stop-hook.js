#!/usr/bin/env node
// agentwatch — Stop hook
// Notifies on risks and anomalies when Claude Code exits

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const { assessRisk } = require('./risk');
const { buildIndex } = require('./sessions');
const { sessionAnomalies } = require('./analytics');

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
    let criticalCount = 0;
    let warningCount = 0;

    for (const line of content.split('\n')) {
      if (!line) continue;
      const entry = JSON.parse(line);
      if (entry.type === 'session_start') continue;
      actionCount++;
      const risks = assessRisk(entry);
      for (const r of risks) {
        if (r.level === 'critical') criticalCount++;
        else if (r.level === 'warning') warningCount++;
      }
    }

    if (actionCount === 0) process.exit(0);

    // Check for anomalies
    const index = buildIndex();
    const anomalies = sessionAnomalies(SESSIONS_DIR, index, sessionId);

    const riskCount = criticalCount + warningCount;

    // Only notify if there are risks or anomalies
    if (riskCount === 0 && anomalies.length === 0) process.exit(0);

    let title, body;

    if (riskCount > 0 && anomalies.length > 0) {
      title = 'agentwatch: risks + anomalies';
      body = buildRiskBody(criticalCount, warningCount) + ' | ' + anomalies[0];
    } else if (riskCount > 0) {
      title = criticalCount > 0 ? 'agentwatch: risks detected' : 'agentwatch: warnings detected';
      body = buildRiskBody(criticalCount, warningCount) + ' — run agentwatch danger';
    } else {
      title = 'agentwatch: unusual session';
      body = anomalies.join('; ');
    }

    notify(title, body, 'Funk');
  } catch (e) {
    // Silent fail
  }
  process.exit(0);
});

function buildRiskBody(criticalCount, warningCount) {
  let body = '';
  if (criticalCount > 0) body += `${criticalCount} critical`;
  if (criticalCount > 0 && warningCount > 0) body += ', ';
  if (warningCount > 0) body += `${warningCount} warning${warningCount !== 1 ? 's' : ''}`;
  return body;
}

function notify(title, body, sound) {
  if (process.platform === 'darwin') {
    const script = `display notification "${body.replace(/["\\]/g, ' ')}" with title "${title.replace(/["\\]/g, ' ')}" sound name "${sound}"`;
    try { execFileSync('osascript', ['-e', script], { timeout: 2000 }); } catch (e) {}
  }
}
