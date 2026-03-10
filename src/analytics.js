// agentwatch — cross-session analytics engine
// Provides insights you can't get from looking at your terminal

const fs = require('fs');
const path = require('path');
const { assessRisk } = require('./risk');

function analyzeRange(sessionsDir, index, startMs, endMs) {
  const sessions = Object.entries(index).filter(([, s]) => {
    const t = new Date(s.started).getTime();
    return t >= startMs && t <= endMs;
  });

  const projects = {};
  const allFiles = {};
  const allCommands = {};
  let totalDuration = 0;
  let totalActions = 0;
  let totalBashCmds = 0;
  let totalBashFails = 0;
  let totalCriticals = 0;
  let totalWarnings = 0;

  for (const [id, meta] of sessions) {
    const project = projectName(meta.cwd);
    if (!projects[project]) {
      projects[project] = { sessions: 0, actions: 0, duration: 0, commands: 0 };
    }
    projects[project].sessions++;
    projects[project].actions += meta.tool_count;

    const dur = durationMs(meta);
    projects[project].duration += dur;
    totalDuration += dur;
    totalActions += meta.tool_count;

    // Parse full JSONL for detailed data
    const logPath = path.join(sessionsDir, `${id}.jsonl`);
    let content;
    try { content = fs.readFileSync(logPath, 'utf8').trim(); } catch (e) { continue; }

    for (const line of content.split('\n')) {
      if (!line) continue;
      let entry;
      try { entry = JSON.parse(line); } catch (e) { continue; }
      if (entry.type === 'session_start') continue;

      // File hotspots
      if (entry.file && (entry.tool === 'Edit' || entry.tool === 'Write')) {
        const f = entry.file;
        if (!allFiles[f]) allFiles[f] = { edits: 0, writes: 0, reads: 0, sessions: new Set() };
        if (entry.tool === 'Edit') allFiles[f].edits++;
        if (entry.tool === 'Write') allFiles[f].writes++;
        allFiles[f].sessions.add(id);
      }
      if (entry.file && entry.tool === 'Read') {
        if (!allFiles[entry.file]) allFiles[entry.file] = { edits: 0, writes: 0, reads: 0, sessions: new Set() };
        allFiles[entry.file].reads++;
        allFiles[entry.file].sessions.add(id);
      }

      // Command patterns
      if (entry.tool === 'Bash' && entry.command) {
        totalBashCmds++;
        projects[project].commands++;
        const normalized = normalizeCommand(entry.command);
        if (!allCommands[normalized]) allCommands[normalized] = { count: 0, pass: 0, fail: 0, hasExitCodes: 0, raw: entry.command };
        allCommands[normalized].count++;
        if (entry.exit_code !== null && entry.exit_code !== undefined) {
          allCommands[normalized].hasExitCodes++;
          if (entry.exit_code === 0) allCommands[normalized].pass++;
          else {
            allCommands[normalized].fail++;
            totalBashFails++;
          }
        }
      }

      // Risks
      const risks = assessRisk(entry);
      for (const r of risks) {
        if (r.level === 'critical') totalCriticals++;
        else if (r.level === 'warning') totalWarnings++;
      }
    }
  }

  // Sort file hotspots by modification count (edits + writes)
  const hotspots = Object.entries(allFiles)
    .map(([file, stats]) => ({
      file,
      modifications: stats.edits + stats.writes,
      reads: stats.reads,
      sessions: stats.sessions.size,
    }))
    .filter(h => h.modifications > 0)
    .sort((a, b) => b.modifications - a.modifications || b.sessions - a.sessions);

  // Sort commands by frequency
  const commands = Object.entries(allCommands)
    .map(([normalized, stats]) => ({
      command: normalized,
      example: stats.raw,
      count: stats.count,
      passRate: stats.hasExitCodes > 0 ? Math.round((stats.pass / stats.hasExitCodes) * 100) : null,
    }))
    .sort((a, b) => b.count - a.count);

  // Sort projects by session count
  const projectList = Object.entries(projects)
    .map(([name, stats]) => ({ name, ...stats }))
    .sort((a, b) => b.sessions - a.sessions);

  return {
    sessionCount: sessions.length,
    totalActions,
    totalDuration,
    totalBashCmds,
    totalBashFails,
    bashPassRate: totalBashCmds > 0 ? Math.round(((totalBashCmds - totalBashFails) / totalBashCmds) * 100) : null,
    totalCriticals,
    totalWarnings,
    projects: projectList,
    hotspots,
    commands,
  };
}

function sessionAnomalies(sessionsDir, index, currentSessionId) {
  const all = Object.entries(index);
  if (all.length < 3) return []; // Need baseline

  const current = index[currentSessionId];
  if (!current) return [];

  // Compute baseline from other sessions (excluding current)
  const others = all.filter(([id]) => id !== currentSessionId).map(([, s]) => s);
  const avg = {
    actions: mean(others.map(s => s.tool_count)),
    commands: mean(others.map(s => s.commands_run)),
    files: mean(others.map(s => s.files_touched.length)),
    risks: mean(others.map(s => s.risk_count)),
  };
  const std = {
    actions: stddev(others.map(s => s.tool_count)),
    commands: stddev(others.map(s => s.commands_run)),
    files: stddev(others.map(s => s.files_touched.length)),
  };

  const anomalies = [];
  const threshold = 2; // standard deviations

  if (std.actions > 0 && current.tool_count > avg.actions + threshold * std.actions) {
    anomalies.push(`Unusually high activity: ${current.tool_count} actions (avg ${Math.round(avg.actions)})`);
  }
  if (std.files > 0 && current.files_touched.length > avg.files + threshold * std.files) {
    anomalies.push(`Touched ${current.files_touched.length} files (avg ${Math.round(avg.files)})`);
  }

  // Check for files outside project directory
  if (current.cwd) {
    const outsideFiles = current.files_touched.filter(f => !f.startsWith(current.cwd));
    // Filter out common safe paths
    const suspicious = outsideFiles.filter(f =>
      !f.includes('node_modules') && !f.includes('.claude')
    );
    if (suspicious.length > 0) {
      anomalies.push(`${suspicious.length} file(s) accessed outside project directory`);
    }
  }

  return anomalies;
}

function normalizeCommand(cmd) {
  return cmd
    .replace(/\s+/g, ' ')
    .replace(/"[^"]*"/g, '"..."')
    .replace(/'[^']*'/g, "'...'")
    .trim()
    .substring(0, 80);
}

function projectName(cwd) {
  if (!cwd) return '(unknown)';
  const parts = cwd.replace(/\/+$/, '').split('/');
  return parts[parts.length - 1] || cwd;
}

function durationMs(meta) {
  if (!meta.started || !meta.last_activity) return 0;
  return Math.max(0, new Date(meta.last_activity).getTime() - new Date(meta.started).getTime());
}

function mean(arr) {
  if (arr.length === 0) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function stddev(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  const variance = arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length;
  return Math.sqrt(variance);
}

function formatDuration(ms) {
  if (!ms || ms <= 0) return '-';
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  return remMins > 0 ? `${hours}h ${remMins}m` : `${hours}h`;
}

function exportSession(sessionsDir, id, meta, format) {
  const logPath = path.join(sessionsDir, `${id}.jsonl`);
  let content;
  try { content = fs.readFileSync(logPath, 'utf8').trim(); } catch (e) { return null; }

  const entries = [];
  let sessionMeta = {};
  for (const line of content.split('\n')) {
    if (!line) continue;
    try {
      const entry = JSON.parse(line);
      if (entry.type === 'session_start') {
        sessionMeta = entry;
        continue;
      }
      entry.risks = assessRisk(entry);
      entries.push(entry);
    } catch (e) {}
  }

  if (format === 'json') {
    return JSON.stringify({ id, meta: sessionMeta, entries }, null, 2);
  }

  // Markdown format
  const dur = durationMs(meta);
  const project = projectName(meta.cwd);
  let md = `# Session ${id.substring(0, 10)} — ${project}\n\n`;
  md += `- **Started:** ${new Date(meta.started).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}\n`;
  md += `- **Duration:** ${formatDuration(dur)}\n`;
  md += `- **Model:** ${meta.model || 'unknown'}\n`;
  md += `- **Directory:** ${meta.cwd || 'unknown'}\n`;
  md += `- **Actions:** ${entries.length}\n\n`;

  // Risks summary
  const allRisks = entries.flatMap(e => e.risks).filter(r => r.level !== 'info');
  if (allRisks.length > 0) {
    md += `## Risks\n\n`;
    for (const r of allRisks) {
      const icon = r.level === 'critical' ? '[CRITICAL]' : '[warning]';
      md += `- ${icon} ${r.msg}\n`;
    }
    md += '\n';
  }

  // Timeline
  md += `## Timeline\n\n`;
  md += `| Time | Tool | Action |\n|------|------|--------|\n`;
  for (const e of entries) {
    const time = new Date(e.timestamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const desc = exportEntryDesc(e);
    md += `| ${time} | ${e.tool} | ${desc} |\n`;
  }
  md += '\n';

  // Files
  const fileMap = {};
  for (const e of entries) {
    if (!e.file) continue;
    if (!fileMap[e.file]) fileMap[e.file] = new Set();
    fileMap[e.file].add(e.tool);
  }
  if (Object.keys(fileMap).length > 0) {
    md += `## Files Touched\n\n`;
    for (const [file, tools] of Object.entries(fileMap)) {
      md += `- \`${shortenPath(file)}\` (${[...tools].join(', ')})\n`;
    }
    md += '\n';
  }

  return md;
}

function exportEntryDesc(entry) {
  switch (entry.tool) {
    case 'Bash': return `\`${(entry.command || '').substring(0, 80).replace(/\|/g, '\\|')}\``;
    case 'Write': return `write \`${shortenPath(entry.file)}\``;
    case 'Edit': return `edit \`${shortenPath(entry.file)}\``;
    case 'Read': return `read \`${shortenPath(entry.file)}\``;
    case 'Glob': return `glob \`${entry.pattern || ''}\``;
    case 'Grep': return `grep \`${entry.pattern || ''}\``;
    case 'WebFetch': return `fetch ${entry.url || ''}`;
    case 'Agent': return `agent: ${entry.description || ''}`;
    default: return entry.tool;
  }
}

function shortenPath(p) {
  if (!p) return '(unknown)';
  const home = require('os').homedir();
  if (p.startsWith(home)) return '~' + p.substring(home.length);
  return p;
}

module.exports = { analyzeRange, sessionAnomalies, formatDuration, durationMs, exportSession, projectName };
