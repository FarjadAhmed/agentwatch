// agentwatch — shared session index builder
// Used by both CLI and dashboard server

const fs = require('fs');
const path = require('path');
const os = require('os');
const { assessRisk } = require('./risk');

const SESSIONS_DIR = path.join(os.homedir(), '.agentwatch', 'sessions');

const SESSION_ID_RE = /^[a-zA-Z0-9_-]+$/;

function isValidSessionId(id) {
  return typeof id === 'string' && id.length > 0 && id.length <= 128 && SESSION_ID_RE.test(id);
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
    if (!isValidSessionId(id)) continue;

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
      let riskCount = 0;

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
        const risks = assessRisk(entry);
        if (risks.length > 0) riskCount += risks.length;
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
        risk_count: riskCount,
      };
    } catch (e) {
      // Skip corrupted files
    }
  }

  return index;
}

module.exports = { SESSIONS_DIR, SESSION_ID_RE, isValidSessionId, buildIndex };
