# agentwatch

A flight recorder for Claude Code sessions.

You let Claude Code run on your machine — sometimes for hours, sometimes with auto-approve. agentwatch silently logs every action, so you can come back and see exactly what happened.

```bash
npm install -g agentwatch-dev
agentwatch install
```

That's it. Two commands. agentwatch is now recording every Claude Code session.

## The commands you'll actually use

```bash
agentwatch last           # what just happened?
agentwatch danger         # did anything risky happen?
agentwatch report         # weekly summary across all projects
```

`last` is the one you'll run most. After a session — especially a long one where you stepped away — it gives you a full timeline: every command, every file touched, every risk flagged.

`danger` scans for things like `rm -rf`, `sudo`, `curl | sh`, writes to `.env` or `.ssh`, force pushes — anything you'd want to know about.

`report` shows you patterns over time: which projects you're using AI on most, which files keep getting modified, which commands keep failing.

## All commands

```
SESSION REVIEW
  agentwatch last              review the most recent session
  agentwatch show <id>         show a specific session by ID prefix
  agentwatch sessions          list all recorded sessions (--all for full list)
  agentwatch live              live-follow current session in terminal
  agentwatch commands          all bash commands with pass/fail status
  agentwatch files             all files touched (Read/Edit/Write)
  agentwatch danger            flag potentially dangerous actions
  agentwatch export [id]       export as markdown (--json for JSON)
  agentwatch tokens [id]       token usage breakdown for a session

ANALYTICS
  agentwatch report [period]   weekly report — projects, hotspots, patterns
                               period: week (default), month, or number of days
  agentwatch hotspots [n]      top N files AI modifies most across sessions
  agentwatch stats             aggregate stats with per-project breakdown

MANAGEMENT
  agentwatch dash              open web dashboard in browser
  agentwatch status            check if agentwatch is installed and working
  agentwatch prune [days]      delete sessions older than N days (default: 30)
  agentwatch install           add hooks to Claude Code
  agentwatch uninstall         remove hooks (logs are preserved)
```

## File hotspots

`agentwatch hotspots` shows which files AI touches most across all your sessions. Files that get modified repeatedly often indicate complex, fragile, or actively-developed code.

## What gets flagged as dangerous

| Pattern | Level |
|---|---|
| `rm -rf` | Critical |
| `curl \| sh` | Critical |
| `sudo` | Critical |
| `git push --force` | Critical |
| `git reset --hard` | Critical |
| Writing to `.env`, `.ssh`, `.aws` | Critical |
| Writing to `/etc/`, `/usr/` | Critical |
| `find -exec rm` / `find -delete` | Critical |
| `mkfs`, `dd if=` | Critical |
| `curl`/`wget` to external hosts | Warning |
| `git push --force-with-lease` | Warning |
| Reading `.env`, `.ssh/id_rsa` | Warning |
| `eval` | Warning |
| `ssh`/`scp` | Warning |
| `kill -9`, `pkill`, `killall` | Warning |
| `pip install`/`npm install` | Info |
| `docker run` | Info |

Critical and warning risks trigger macOS notifications in real-time. Info-level events are logged silently.

## How it works

agentwatch uses Claude Code's [hooks system](https://docs.anthropic.com/en/docs/claude-code/hooks):

1. **SessionStart hook** — records session metadata (cwd, model, timestamp)
2. **PostToolUse hook** — logs each tool invocation, sends notification on critical risks
3. **Stop hook** — checks for anomalies vs your historical baseline, notifies if unusual
4. Logs stored as JSONL in `~/.agentwatch/sessions/`

The hooks run asynchronously with a 3-second timeout and silent failure — they never block or interfere with Claude Code. All data stays local on your machine.

## Uninstall

```bash
agentwatch uninstall     # removes hooks from Claude Code settings
npm uninstall -g agentwatch-dev
```

Session logs are preserved in `~/.agentwatch/` — delete manually if you want.

## Requirements

- Node.js 18+
- Claude Code

## License

MIT — created by [Farjad Ahmed](https://github.com/FarjadAhmed)
