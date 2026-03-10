const state = {
  sessions: {},
  activeSession: null,
  entries: [],
  activeTab: 'timeline',
};

const homedir = '~';

async function fetchSessions() {
  const res = await fetch('/api/sessions');
  state.sessions = await res.json();
  renderSidebar();
  document.getElementById('total-sessions').textContent = Object.keys(state.sessions).length;
  const totalActions = Object.values(state.sessions).reduce((s, v) => s + v.tool_count, 0);
  document.getElementById('total-actions').textContent = totalActions;
}

async function fetchSession(id) {
  const res = await fetch('/api/session?id=' + encodeURIComponent(id));
  state.entries = await res.json();
  state.activeSession = id;
  renderSidebar();
  renderMain();
}

function renderSidebar() {
  const list = document.getElementById('session-list');
  const searchInput = document.getElementById('session-search');
  const filter = (searchInput ? searchInput.value : '').toLowerCase().trim();

  const sorted = Object.entries(state.sessions).sort((a, b) =>
    new Date(b[1].started) - new Date(a[1].started)
  );

  const filtered = filter ? sorted.filter(([id, s]) => {
    const dir = (s.cwd || '').toLowerCase();
    const label = sessionLabel(s).toLowerCase();
    return dir.includes(filter) || label.includes(filter) || id.toLowerCase().includes(filter);
  }) : sorted;

  // Group by date
  const groups = {};
  for (const [id, s] of filtered) {
    const label = dateBucket(s.started);
    if (!groups[label]) groups[label] = [];
    groups[label].push([id, s]);
  }

  let html = '';
  for (const [label, sessions] of Object.entries(groups)) {
    html += '<div class="date-group-header">' + escHtml(label) + ' <span class="date-group-count">' + sessions.length + '</span></div>';
    for (const [id, s] of sessions) {
      const active = id === state.activeSession ? 'active' : '';
      const short = id.substring(0, 8);
      const time = formatTimeOnly(s.started);
      const project = sessionLabel(s);

      let tags = '<div class="session-tags">';
      // Tool breakdown pills
      const topTools = Object.entries(s.tools_used || {}).sort((a, b) => b[1] - a[1]).slice(0, 3);
      for (const [tool, count] of topTools) {
        tags += '<span class="tag tool-' + tool.toLowerCase() + '">' + count + ' ' + toolShortName(tool) + '</span>';
      }
      if (s.files_touched && s.files_touched.length > 0) {
        tags += '<span class="tag">' + s.files_touched.length + ' files</span>';
      }
      tags += '</div>';

      html += '<div class="session-item ' + active + '" onclick="fetchSession(\'' + id + '\')">' +
        '<div class="session-header-row"><div class="session-project">' + escHtml(project) + '</div>' +
        (hasDangers(s) ? '<span class="session-risk-badge">' + s.risk_count + '</span>' : '') +
        '</div>' +
        '<div class="session-meta">' + time + ' &middot; ' + s.tool_count + ' actions &middot; <span class="session-id-inline">' + short + '</span></div>' +
        tags +
        '</div>';
    }
  }

  if (filtered.length === 0 && filter) {
    html = '<div class="sidebar-empty">No sessions matching &ldquo;' + escHtml(filter) + '&rdquo;</div>';
  }

  list.innerHTML = html;
}

function dateBucket(iso) {
  if (!iso) return 'Unknown';
  const d = new Date(iso);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const sessionDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((today - sessionDay) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return d.toLocaleDateString('en-US', { weekday: 'long' });
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function projectName(cwd) {
  if (!cwd) return null;
  const parts = cwd.replace(/\/+$/, '').split('/');
  return parts[parts.length - 1] || cwd;
}

function sessionLabel(s) {
  // Try project name from cwd
  const project = projectName(s.cwd);
  if (project) return project;
  // Infer from most common file path
  if (s.files_touched && s.files_touched.length > 0) {
    const first = s.files_touched[0];
    const parts = first.split('/');
    // Find the project-level directory (typically after home dir)
    for (var i = parts.length - 2; i >= 0; i--) {
      if (['src', 'lib', 'bin', 'test', 'tests', 'node_modules', '.claude'].indexOf(parts[i]) === -1) {
        return parts[i];
      }
    }
    return parts[parts.length - 2] || 'Session';
  }
  return 'Session';
}

function hasDangers(s) {
  return (s.risk_count || 0) > 0;
}

function toolShortName(tool) {
  var names = { Bash: 'bash', Read: 'reads', Write: 'writes', Edit: 'edits', Glob: 'globs', Grep: 'greps', WebFetch: 'fetches', Agent: 'agents' };
  return names[tool] || tool.toLowerCase();
}

function toolBadgeLabel(tool) {
  var labels = { Bash: 'SH', Read: 'RD', Write: 'WR', Edit: 'ED', Glob: 'GL', Grep: 'GR', WebFetch: 'WEB', Agent: 'AGT' };
  return labels[tool] || tool.substring(0, 2).toUpperCase();
}

function formatTimeOnly(iso) {
  if (!iso) return '?';
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function renderMain() {
  const main = document.getElementById('main');
  const meta = state.sessions[state.activeSession] || {};
  const entries = state.entries;

  const allRisks = entries.flatMap(e => e.risks.map(r => ({ ...r, entry: e })));
  const criticals = allRisks.filter(r => r.level === 'critical');
  const warnings = allRisks.filter(r => r.level === 'warning');

  // Alerts
  let alertsHtml;
  if (allRisks.length === 0) {
    alertsHtml = '<div class="alerts clean"><div class="alerts-title">No dangerous actions detected</div></div>';
  } else {
    alertsHtml = '<div class="alerts"><div class="alerts-title">' +
      allRisks.length + ' potentially risky action' + (allRisks.length > 1 ? 's' : '') + ' detected</div>';
    for (const r of allRisks) {
      alertsHtml += '<div class="alert-item"><span class="alert-badge ' + r.level + '">' + r.level + '</span> ' +
        escHtml(r.msg) + ' <span style="color:var(--text-muted)">(' + escHtml(formatEntryShort(r.entry)) + ')</span></div>';
    }
    alertsHtml += '</div>';
  }

  // Stats
  const toolCounts = {};
  const files = new Set();
  let cmdCount = 0;
  for (const e of entries) {
    toolCounts[e.tool] = (toolCounts[e.tool] || 0) + 1;
    if (e.file) files.add(e.file);
    if (e.tool === 'Bash') cmdCount++;
  }

  const statsHtml = '<div class="stats-row">' +
    statCard('Actions', entries.length, '--accent') +
    statCard('Commands', cmdCount, '--yellow') +
    statCard('Files', files.size, '--green') +
    statCard('Risks', allRisks.length, allRisks.length > 0 ? '--red' : '--green') +
    '</div>';

  // Tabs
  const tabsHtml = '<div class="tabs">' +
    tab('dag', 'DAG') +
    tab('timeline', 'Timeline') +
    tab('commands', 'Commands') +
    tab('files', 'Files') +
    '</div>';

  let contentHtml = '';
  if (state.activeTab === 'dag') {
    contentHtml = renderDAG(entries);
  } else if (state.activeTab === 'timeline') {
    contentHtml = renderTimeline(entries);
  } else if (state.activeTab === 'commands') {
    contentHtml = renderCommands(entries);
  } else if (state.activeTab === 'files') {
    contentHtml = renderFiles(entries);
  }

  main.innerHTML = alertsHtml + statsHtml + tabsHtml + contentHtml;
}

function renderTimeline(entries) {
  if (entries.length === 0) return '<div class="empty-state">No actions recorded</div>';

  let html = '<ul class="timeline">';
  for (const e of entries) {
    const hasRisk = e.risks.length > 0 ? 'has-risk' : '';
    const iconClass = ['Bash','Write','Edit','Read','Glob','Grep','WebFetch','Agent'].includes(e.tool) ? e.tool : 'unknown';

    let risksHtml = '';
    if (e.risks.length > 0) {
      risksHtml = '<div class="entry-risks">' +
        e.risks.map(r => '<span class="risk-tag ' + r.level + '">' + escHtml(r.msg) + '</span>').join('') +
        '</div>';
    }

    html += '<li class="timeline-entry ' + hasRisk + '">' +
      '<span class="entry-time">' + formatTimeShort(e.timestamp) + '</span>' +
      '<span class="entry-icon ' + iconClass + '">' + toolBadgeLabel(e.tool) + '</span>' +
      '<div class="entry-content"><div class="entry-desc">' + formatEntryHtml(e) + '</div>' + risksHtml + '</div>' +
      '</li>';
  }
  html += '</ul>';
  return html;
}

function renderCommands(entries) {
  const cmds = entries.filter(e => e.tool === 'Bash');
  if (cmds.length === 0) return '<div class="empty-state">No commands in this session</div>';

  let html = '<ul class="cmd-list">';
  for (const e of cmds) {
    html += '<li class="cmd-item">' +
      '<span class="entry-time">' + formatTimeShort(e.timestamp) + '</span>' +
      '<span class="cmd-text">' + escHtml(e.command || '(empty)') + '</span>' +
      '</li>';
  }
  html += '</ul>';
  return html;
}

function renderFiles(entries) {
  const fileMap = {};
  for (const e of entries) {
    if (!e.file) continue;
    if (!fileMap[e.file]) fileMap[e.file] = new Set();
    if (e.tool === 'Read') fileMap[e.file].add('R');
    if (e.tool === 'Write') fileMap[e.file].add('W');
    if (e.tool === 'Edit') fileMap[e.file].add('E');
  }

  const files = Object.entries(fileMap);
  if (files.length === 0) return '<div class="empty-state">No files touched in this session</div>';

  let html = '<ul class="file-list">';
  for (const [file, actions] of files) {
    const badges = ['R', 'E', 'W'].filter(a => actions.has(a))
      .map(a => '<span class="file-badge ' + a + '">' + a + '</span>').join('');
    html += '<li class="file-item"><div class="file-badges">' + badges + '</div>' +
      '<span class="file-path">' + escHtml(shortenPath(file)) + '</span></li>';
  }
  html += '</ul>';
  return html;
}

function renderDAG(entries) {
  if (entries.length === 0) return '<div class="empty-state">No actions recorded</div>';

  const MIN_W = 160;
  const MAX_W = 520;
  const MIN_H = 44;
  const LINE_H = 16;
  const CHAR_W = 6.8;
  const BADGE_W = 36;
  const GAP_X = 70;
  const GAP_Y = 18;
  const PAD = 50;
  const TIME_COL_W = 75;

  const toolColors = {
    Bash:     { fill: 'rgba(210,153,34,0.12)', stroke: '#d29922', text: '#d29922', glow: 'rgba(210,153,34,0.25)' },
    Write:    { fill: 'rgba(248,81,73,0.12)', stroke: '#f85149', text: '#f85149', glow: 'rgba(248,81,73,0.25)' },
    Edit:     { fill: 'rgba(188,140,255,0.12)', stroke: '#bc8cff', text: '#bc8cff', glow: 'rgba(188,140,255,0.25)' },
    Read:     { fill: 'rgba(88,166,255,0.12)', stroke: '#58a6ff', text: '#58a6ff', glow: 'rgba(88,166,255,0.25)' },
    Glob:     { fill: 'rgba(57,210,192,0.12)', stroke: '#39d2c0', text: '#39d2c0', glow: 'rgba(57,210,192,0.25)' },
    Grep:     { fill: 'rgba(57,210,192,0.12)', stroke: '#39d2c0', text: '#39d2c0', glow: 'rgba(57,210,192,0.25)' },
    WebFetch: { fill: 'rgba(63,185,80,0.12)', stroke: '#3fb950', text: '#3fb950', glow: 'rgba(63,185,80,0.25)' },
    Agent:    { fill: 'rgba(247,120,186,0.12)', stroke: '#f778ba', text: '#f778ba', glow: 'rgba(247,120,186,0.25)' },
  };
  const defaultColor = { fill: 'rgba(125,133,144,0.12)', stroke: '#7d8590', text: '#7d8590', glow: 'rgba(125,133,144,0.2)' };

  // Measure each node
  const nodes = [];
  const edges = [];
  const fileLanes = {};
  let nextLane = 1;
  const fileLastNode = {};

  for (var i = 0; i < entries.length; i++) {
    const e = entries[i];
    const label = dagLabel(e);
    const lines = dagWrapLines(label, MAX_W - BADGE_W - 20);
    const textW = Math.max.apply(null, lines.map(function(l) { return l.length; })) * CHAR_W + BADGE_W + 24;
    const nodeW = Math.max(MIN_W, Math.min(MAX_W, textW));
    const nodeH = Math.max(MIN_H, MIN_H + (lines.length - 1) * LINE_H);

    let col = 0;
    if (e.file) {
      if (!fileLanes[e.file]) fileLanes[e.file] = 0;
      if (fileLastNode[e.file] !== undefined) {
        if (fileLanes[e.file] === 0) fileLanes[e.file] = nextLane++;
        col = fileLanes[e.file];
      }
    }

    nodes.push({ idx: i, entry: e, col: col, w: nodeW, h: nodeH, lines: lines, label: label, x: 0, y: 0 });
  }

  // Layout
  const maxCol = Math.max.apply(null, [0].concat(nodes.map(function(n) { return n.col; })));
  const colWidths = {};
  for (var ni = 0; ni < nodes.length; ni++) {
    const n = nodes[ni];
    colWidths[n.col] = Math.max(colWidths[n.col] || 0, n.w);
  }

  const colX = {};
  let xOffset = PAD + TIME_COL_W;
  for (var c = 0; c <= maxCol; c++) {
    colX[c] = xOffset;
    xOffset += (colWidths[c] || MIN_W) + GAP_X;
  }

  let curY = PAD;
  for (var ni2 = 0; ni2 < nodes.length; ni2++) {
    nodes[ni2].x = colX[nodes[ni2].col];
    nodes[ni2].y = curY;
    curY += nodes[ni2].h + GAP_Y;
  }

  // Build edges
  for (var ei = 1; ei < nodes.length; ei++) {
    if (nodes[ei].col === 0 && nodes[ei-1].col === 0) {
      edges.push({ from: ei - 1, to: ei, type: 'flow' });
    } else if (nodes[ei].col === 0) {
      for (var j = ei - 1; j >= 0; j--) {
        if (nodes[j].col === 0) { edges.push({ from: j, to: ei, type: 'flow' }); break; }
      }
    }
  }
  const fileLastNode2 = {};
  for (var fi = 0; fi < entries.length; fi++) {
    const fe = entries[fi];
    if (fe.file && fileLastNode2[fe.file] !== undefined && fileLastNode2[fe.file] !== fi) {
      edges.push({ from: fileLastNode2[fe.file], to: fi, type: 'file' });
    }
    if (fe.file) fileLastNode2[fe.file] = fi;
  }

  // SVG
  const svgW = xOffset + PAD;
  const svgH = curY + PAD;

  let svg = '<div class="dag-container"><svg width="' + svgW + '" height="' + svgH + '" xmlns="http://www.w3.org/2000/svg">';

  svg += '<defs>';
  svg += '<marker id="arrow-flow" viewBox="0 0 10 6" refX="10" refY="3" markerWidth="8" markerHeight="6" orient="auto"><path d="M0,0 L10,3 L0,6" fill="#30363d"/></marker>';
  svg += '<marker id="arrow-file" viewBox="0 0 10 6" refX="10" refY="3" markerWidth="8" markerHeight="6" orient="auto"><path d="M0,0 L10,3 L0,6" fill="#58a6ff"/></marker>';
  for (var tool in toolColors) {
    const col2 = toolColors[tool];
    svg += '<filter id="glow-' + tool + '" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="0" stdDeviation="3" flood-color="' + col2.glow + '" flood-opacity="0.6"/></filter>';
  }
  svg += '<filter id="glow-risk" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="0" stdDeviation="4" flood-color="rgba(248,81,73,0.6)" flood-opacity="0.8"/></filter>';
  svg += '</defs>';

  // Draw edges
  for (var di = 0; di < edges.length; di++) {
    const edge = edges[di];
    const from = nodes[edge.from];
    const to = nodes[edge.to];
    const x1 = from.x + from.w / 2;
    const y1 = from.y + from.h;
    const x2 = to.x + to.w / 2;
    const y2 = to.y;

    if (edge.type === 'flow') {
      if (Math.abs(x1 - x2) < 2) {
        svg += '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" stroke="#30363d" stroke-width="1.5" marker-end="url(#arrow-flow)"/>';
      } else {
        var cy1 = y1 + (y2 - y1) * 0.4;
        var cy2 = y1 + (y2 - y1) * 0.6;
        svg += '<path d="M' + x1 + ',' + y1 + ' C' + x1 + ',' + cy1 + ' ' + x2 + ',' + cy2 + ' ' + x2 + ',' + y2 + '" fill="none" stroke="#30363d" stroke-width="1.5" marker-end="url(#arrow-flow)"/>';
      }
    } else {
      const fcy1 = y1 + (y2 - y1) * 0.35;
      const fcy2 = y1 + (y2 - y1) * 0.65;
      svg += '<path d="M' + x1 + ',' + y1 + ' C' + x1 + ',' + fcy1 + ' ' + x2 + ',' + fcy2 + ' ' + x2 + ',' + y2 + '" fill="none" stroke="#58a6ff" stroke-width="1" stroke-dasharray="5,4" opacity="0.45" marker-end="url(#arrow-file)"/>';
    }
  }

  // Draw nodes
  for (var ndi = 0; ndi < nodes.length; ndi++) {
    const nd = nodes[ndi];
    const ne = nd.entry;
    const colors = toolColors[ne.tool] || defaultColor;
    const hasRisk = ne.risks && ne.risks.length > 0;
    const strokeColor = hasRisk ? '#f85149' : colors.stroke;
    const strokeW = hasRisk ? 2 : 1;
    const filterAttr = hasRisk ? 'glow-risk' : 'glow-' + ne.tool;
    const filter = (toolColors[ne.tool] || hasRisk) ? ' filter="url(#' + filterAttr + ')"' : '';

    svg += '<g class="dag-node"' + filter + '>';

    // Main rect
    svg += '<rect x="' + nd.x + '" y="' + nd.y + '" width="' + nd.w + '" height="' + nd.h + '" rx="8" ry="8" fill="' + colors.fill + '" stroke="' + strokeColor + '" stroke-width="' + strokeW + '"/>';

    // Tool badge
    svg += '<clipPath id="clip-badge-' + nd.idx + '"><rect x="' + nd.x + '" y="' + nd.y + '" width="' + BADGE_W + '" height="' + nd.h + '" rx="8" ry="8"/></clipPath>';
    svg += '<rect x="' + nd.x + '" y="' + nd.y + '" width="' + BADGE_W + '" height="' + nd.h + '" fill="' + colors.stroke + '" opacity="0.18" clip-path="url(#clip-badge-' + nd.idx + ')"/>';
    svg += '<line x1="' + (nd.x + BADGE_W) + '" y1="' + nd.y + '" x2="' + (nd.x + BADGE_W) + '" y2="' + (nd.y + nd.h) + '" stroke="' + colors.stroke + '" opacity="0.25" stroke-width="1"/>';
    svg += '<text x="' + (nd.x + BADGE_W / 2) + '" y="' + (nd.y + nd.h / 2 + 1) + '" text-anchor="middle" dominant-baseline="middle" fill="' + colors.text + '" font-size="10" font-weight="800" font-family="monospace" letter-spacing="0.5">' + escHtml(ne.tool.substring(0, 3).toUpperCase()) + '</text>';

    // Label lines
    const textX = nd.x + BADGE_W + 10;
    const textStartY = nd.y + (nd.h - nd.lines.length * LINE_H) / 2 + LINE_H * 0.65;
    for (var li = 0; li < nd.lines.length; li++) {
      const opacity = li === 0 ? 1 : 0.7;
      svg += '<text x="' + textX + '" y="' + (textStartY + li * LINE_H) + '" fill="' + colors.text + '" font-size="11.5" font-family="ui-monospace, SFMono-Regular, monospace" opacity="' + opacity + '">' + escHtml(nd.lines[li]) + '</text>';
    }

    // Risk badge
    if (hasRisk) {
      const rx = nd.x + nd.w - 14;
      const ry = nd.y + 12;
      svg += '<circle cx="' + rx + '" cy="' + ry + '" r="7" fill="#f85149"/>';
      svg += '<text x="' + rx + '" y="' + (ry + 1) + '" text-anchor="middle" dominant-baseline="middle" fill="#fff" font-size="10" font-weight="800">!</text>';
    }

    // Bytes indicator for Write
    if (ne.tool === 'Write' && ne.bytes) {
      const barMaxW = nd.w - BADGE_W - 20;
      const barW = Math.max(4, Math.min(barMaxW, Math.log2(ne.bytes + 1) / 20 * barMaxW));
      svg += '<rect x="' + textX + '" y="' + (nd.y + nd.h - 6) + '" width="' + barW + '" height="2" rx="1" fill="' + colors.stroke + '" opacity="0.4"/>';
    }

    svg += '</g>';

    // Time label
    svg += '<text x="' + (nd.x - 10) + '" y="' + (nd.y + nd.h / 2 + 1) + '" text-anchor="end" dominant-baseline="middle" fill="#484f58" font-size="10" font-family="monospace">' + formatTimeShort(ne.timestamp) + '</text>';
  }

  svg += '</svg></div>';

  // Legend
  svg += '<div class="dag-legend">';
  svg += '<span class="dag-legend-title">Legend</span>';
  for (var lt in toolColors) {
    const lc = toolColors[lt];
    svg += '<span class="dag-legend-item"><span class="dag-legend-dot" style="background:' + lc.stroke + ';box-shadow:0 0 5px ' + lc.glow + '"></span>' + lt + '</span>';
  }
  svg += '<span class="dag-legend-item"><span class="dag-legend-line solid"></span>flow</span>';
  svg += '<span class="dag-legend-item"><span class="dag-legend-line dashed"></span>file dep</span>';
  svg += '<span class="dag-legend-item"><span class="dag-legend-dot risk"></span>risk</span>';
  svg += '</div>';

  return svg;
}

function dagLabel(e) {
  switch (e.tool) {
    case 'Bash': return e.command || '(empty)';
    case 'Write': {
      const sizeStr = e.bytes ? ' (' + formatBytes(e.bytes) + ')' : '';
      return shortenPath(e.file) + sizeStr;
    }
    case 'Edit': return shortenPath(e.file);
    case 'Read': return shortenPath(e.file);
    case 'Glob': return e.pattern || '';
    case 'Grep': return e.pattern || '';
    case 'WebFetch': return (e.url || '').replace(/^https?:\/\//, '');
    case 'Agent': return (e.description || '') + (e.subagent_type ? ' [' + e.subagent_type + ']' : '');
    default: return e.tool;
  }
}

function dagWrapLines(text, maxPxW) {
  if (!text) return [''];
  const maxChars = Math.floor(maxPxW / 6.8);
  const hardMax = 65;
  const lineLen = Math.min(maxChars, hardMax);
  if (text.length <= lineLen) return [text];

  const lines = [];
  let remaining = text;
  const maxLines = 3;
  while (remaining.length > 0 && lines.length < maxLines) {
    if (remaining.length <= lineLen) {
      lines.push(remaining);
      break;
    }
    let breakAt = remaining.lastIndexOf(' ', lineLen);
    if (breakAt < lineLen * 0.4) breakAt = remaining.lastIndexOf('/', lineLen);
    if (breakAt < lineLen * 0.4) breakAt = remaining.lastIndexOf('&&', lineLen);
    if (breakAt < lineLen * 0.4) breakAt = lineLen;
    const line = remaining.substring(0, breakAt).trimEnd();
    lines.push(line);
    remaining = remaining.substring(breakAt).trimStart();
    if (lines.length === maxLines && remaining.length > 0) {
      lines[maxLines - 1] = lines[maxLines - 1].substring(0, lineLen - 3) + '...';
    }
  }
  return lines.length ? lines : [''];
}

// Helpers

function statCard(label, value, colorVar) {
  return '<div class="stat-card"><div class="label">' + label + '</div>' +
    '<div class="value" style="color:var(' + colorVar + ')">' + value + '</div></div>';
}

function tab(id, label) {
  const active = state.activeTab === id ? 'active' : '';
  return '<button class="tab ' + active + '" onclick="switchTab(\'' + id + '\')">' + label + '</button>';
}

function switchTab(id) {
  state.activeTab = id;
  renderMain();
}

function formatEntryHtml(e) {
  switch (e.tool) {
    case 'Bash':
      return '<span class="action">$</span> <span class="cmd">' + escHtml(truncate(e.command, 120) || '(empty)') + '</span>';
    case 'Write':
      return '<span class="action">write</span> <span class="path">' + escHtml(shortenPath(e.file)) + '</span> <span class="bytes">(' + formatBytes(e.bytes) + ')</span>';
    case 'Edit':
      return '<span class="action">edit</span> <span class="path">' + escHtml(shortenPath(e.file)) + '</span>';
    case 'Read':
      return '<span class="action">read</span> <span class="path">' + escHtml(shortenPath(e.file)) + '</span>';
    case 'Glob':
      return '<span class="action">glob</span> ' + escHtml(e.pattern || '');
    case 'Grep':
      return '<span class="action">grep</span> ' + escHtml(e.pattern || '');
    case 'WebFetch':
      return '<span class="action">fetch</span> <span class="url">' + escHtml(e.url || '') + '</span>';
    case 'Agent':
      return '<span class="action">agent</span> ' + escHtml(e.description || e.subagent_type || '');
    default:
      return '<span class="action">' + escHtml(e.tool) + '</span>';
  }
}

function formatEntryShort(e) {
  if (e.tool === 'Bash') return truncate(e.command, 50) || '(empty)';
  if (e.file) return shortenPath(e.file);
  if (e.url) return e.url;
  return e.tool;
}

function formatTime(iso) {
  if (!iso) return '?';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) + ' ' +
    d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function formatTimeShort(iso) {
  if (!iso) return '??:??';
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function shortenPath(p) {
  if (!p) return '(unknown)';
  const homeMatch = p.match(/^\/Users\/[^\/]+/);
  if (homeMatch) return '~' + p.substring(homeMatch[0].length);
  return p;
}

function truncate(str, max) {
  if (!str) return null;
  return str.length <= max ? str : str.substring(0, max) + '...';
}

function escHtml(s) {
  if (!s) return '';
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Search filter
document.getElementById('session-search').addEventListener('input', renderSidebar);

// Init + auto-refresh
fetchSessions().then(function() {
  const sorted = Object.entries(state.sessions).sort(function(a, b) {
    return new Date(b[1].started) - new Date(a[1].started);
  });
  if (sorted.length > 0) fetchSession(sorted[0][0]);
});

// Refresh every 2 seconds
setInterval(async function() {
  await fetchSessions();
  if (state.activeSession) {
    const res = await fetch('/api/session?id=' + encodeURIComponent(state.activeSession));
    const newEntries = await res.json();
    if (newEntries.length !== state.entries.length) {
      state.entries = newEntries;
      renderMain();
    }
  }
}, 2000);
