#!/usr/bin/env node
// agentwatch — PostToolUse hook for Claude Code
// Appends tool invocations to ~/.agentwatch/sessions/<session_id>.jsonl

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
    const entry = buildEntry(data);

    fs.appendFileSync(logPath, JSON.stringify(entry) + '\n');
  } catch (e) {
    // Silent fail — never block Claude Code
  }
  process.exit(0);
});

function buildEntry(data) {
  const entry = {
    timestamp: new Date().toISOString(),
    tool: data.tool_name,
    tool_use_id: data.tool_use_id,
  };

  switch (data.tool_name) {
    case 'Bash':
      entry.command = data.tool_input?.command;
      entry.description = data.tool_input?.description;
      entry.exit_code = extractExitCode(data.tool_response);
      break;
    case 'Write':
      entry.file = data.tool_input?.file_path || data.tool_input?.filePath;
      entry.bytes = data.tool_input?.content?.length || 0;
      break;
    case 'Edit':
      entry.file = data.tool_input?.file_path || data.tool_input?.filePath;
      entry.old_string_preview = truncate(data.tool_input?.old_string, 100);
      entry.new_string_preview = truncate(data.tool_input?.new_string, 100);
      break;
    case 'Read':
      entry.file = data.tool_input?.file_path || data.tool_input?.filePath;
      entry.offset = data.tool_input?.offset;
      entry.limit = data.tool_input?.limit;
      break;
    case 'Glob':
      entry.pattern = data.tool_input?.pattern;
      entry.search_path = data.tool_input?.path;
      break;
    case 'Grep':
      entry.pattern = data.tool_input?.pattern;
      entry.search_path = data.tool_input?.path;
      break;
    case 'WebFetch':
      entry.url = data.tool_input?.url;
      entry.prompt = truncate(data.tool_input?.prompt, 100);
      break;
    case 'Agent':
      entry.description = data.tool_input?.description;
      entry.subagent_type = data.tool_input?.subagent_type;
      entry.prompt_preview = truncate(data.tool_input?.prompt, 150);
      break;
    default:
      entry.input_keys = data.tool_input ? Object.keys(data.tool_input) : [];
      break;
  }

  return entry;
}

function extractExitCode(response) {
  if (!response || typeof response === 'string') return null;
  return response.exitCode ?? response.exit_code ?? null;
}

function truncate(str, max) {
  if (!str) return null;
  if (str.length <= max) return str;
  return str.substring(0, max) + '...';
}
