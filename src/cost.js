// agentwatch — cost tracking
// Reads token usage from Claude Code's own session logs in ~/.claude/projects/

const fs = require('fs');
const path = require('path');
const os = require('os');

const CLAUDE_PROJECTS_DIR = path.join(os.homedir(), '.claude', 'projects');

// Pricing per million tokens (USD) — update as Anthropic changes pricing
const PRICING = {
  'claude-opus-4-6': { input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.5 },
  'claude-sonnet-4-6': { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.30 },
  'claude-haiku-4-5': { input: 0.80, output: 4, cacheWrite: 1, cacheRead: 0.08 },
  // Older model aliases
  'claude-sonnet-4-5-20250514': { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.30 },
};

function cwdToProjectDir(cwd) {
  if (!cwd) return null;
  return cwd.replace(/[/.]/g, '-');
}

function findClaudeLog(sessionId, cwd) {
  // Try exact project dir match first
  if (cwd) {
    const projectDir = cwdToProjectDir(cwd);
    const logPath = path.join(CLAUDE_PROJECTS_DIR, projectDir, `${sessionId}.jsonl`);
    if (fs.existsSync(logPath)) return logPath;
  }

  // Fallback: search all project dirs for this session ID
  try {
    const dirs = fs.readdirSync(CLAUDE_PROJECTS_DIR);
    for (const dir of dirs) {
      const logPath = path.join(CLAUDE_PROJECTS_DIR, dir, `${sessionId}.jsonl`);
      if (fs.existsSync(logPath)) return logPath;
    }
  } catch (e) {}

  return null;
}

function getSessionCost(sessionId, cwd) {
  const logPath = findClaudeLog(sessionId, cwd);
  if (!logPath) return null;

  let content;
  try { content = fs.readFileSync(logPath, 'utf8').trim(); } catch (e) { return null; }

  const tokens = {
    input: 0,
    output: 0,
    cacheWrite: 0,
    cacheRead: 0,
  };
  let model = null;
  let messageCount = 0;

  for (const line of content.split('\n')) {
    if (!line) continue;
    let entry;
    try { entry = JSON.parse(line); } catch (e) { continue; }

    if (entry.type !== 'assistant' && entry.message?.usage === undefined) continue;

    const msg = entry.message;
    if (!msg || typeof msg !== 'object') continue;

    if (msg.model && !model) model = msg.model;

    const usage = msg.usage;
    if (!usage) continue;

    messageCount++;
    tokens.input += usage.input_tokens || 0;
    tokens.output += usage.output_tokens || 0;
    tokens.cacheWrite += usage.cache_creation_input_tokens || 0;
    tokens.cacheRead += usage.cache_read_input_tokens || 0;
  }

  if (messageCount === 0) return null;

  // Find pricing for model
  const pricing = findPricing(model);
  const cost = pricing ? computeCost(tokens, pricing) : null;

  return {
    model,
    messageCount,
    tokens,
    cost,
    totalTokens: tokens.input + tokens.output + tokens.cacheWrite + tokens.cacheRead,
  };
}

function findPricing(model) {
  if (!model) return null;
  // Exact match
  if (PRICING[model]) return PRICING[model];
  // Partial match (model IDs sometimes have version suffixes)
  for (const [key, pricing] of Object.entries(PRICING)) {
    if (model.includes(key) || key.includes(model)) return pricing;
  }
  // Family match
  if (model.includes('opus')) return PRICING['claude-opus-4-6'];
  if (model.includes('sonnet')) return PRICING['claude-sonnet-4-6'];
  if (model.includes('haiku')) return PRICING['claude-haiku-4-5'];
  return null;
}

function computeCost(tokens, pricing) {
  const perM = 1_000_000;
  return (
    (tokens.input / perM) * pricing.input +
    (tokens.output / perM) * pricing.output +
    (tokens.cacheWrite / perM) * pricing.cacheWrite +
    (tokens.cacheRead / perM) * pricing.cacheRead
  );
}

function formatCost(cost) {
  if (cost === null || cost === undefined) return '?';
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  if (cost < 1) return `$${cost.toFixed(3)}`;
  return `$${cost.toFixed(2)}`;
}

function formatTokens(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

module.exports = { getSessionCost, formatCost, formatTokens, PRICING };
