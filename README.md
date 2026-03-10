# agentwatch

See what AI coding agents do on your machine.

agentwatch hooks into Claude Code and silently logs every action — bash commands, file reads/writes, web fetches, agent spawns — then gives you cross-session analytics, file hotspots, and anomaly detection you can't get anywhere else.

## Why

AI coding agents run commands on your machine. You approve them, but:

- Which files does AI modify most across all your projects? (**hotspots**)
- How much time do you actually spend in AI sessions? (**duration tracking**)
- Was that session unusual compared to your baseline? (**anomaly detection**)
- What commands keep failing? (**pass/fail rates**)
- Did anything dangerous happen while you weren't paying attention? (**risk alerts**)

agentwatch answers these. Zero config, zero overhead.

## Install

```bash
npm install -g agentwatch
agentwatch install
```

That's it. Two commands. agentwatch is now logging every Claude Code session.

## Usage

```bash
# After a session
agentwatch last              # what just happened?
agentwatch danger            # anything risky?

# Cross-session analytics
agentwatch report            # weekly summary across all projects
agentwatch hotspots          # files AI modifies most (complexity signal)
agentwatch stats             # aggregate stats with per-project breakdown

# Export for sharing
agentwatch export > session.md        # markdown for PRs
agentwatch export --json > out.json   # structured data
```

### All commands

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

ANALYTICS
  agentwatch report [period]   weekly report — projects, hotspots, patterns
                               period: week (default), month, or number of days
  agentwatch hotspots [n]      top N files AI modifies most across sessions
  agentwatch stats             aggregate stats with per-project breakdown

MANAGEMENT
  agentwatch dash              open web dashboard at agentwatch.localhost:3737
  agentwatch status            check if agentwatch is installed and working
  agentwatch prune [days]      delete sessions older than N days (default: 30)
  agentwatch install           add hooks to Claude Code
  agentwatch uninstall         remove hooks (logs are preserved)
```

## Weekly Report

`agentwatch report` gives you a summary you'd actually look at:

- **Per-project breakdown** — sessions, duration, and action count per project
- **File hotspots** — most-modified files across sessions (complexity/fragility signal)
- **Command patterns** — most frequent bash commands with pass/fail rates
- **Risk summary** — criticals and warnings across the period

Run `agentwatch report month` for a 30-day view, or `agentwatch report 14` for last 14 days.

## File Hotspots

`agentwatch hotspots` shows which files AI touches most across all your sessions. Files that get modified repeatedly across multiple sessions often indicate:

- Complex code that needs frequent fixes
- Active development areas
- Fragile code that breaks when other things change

## Anomaly Detection

The stop hook automatically compares each session to your historical baseline. If a session has unusually high activity, touches an abnormal number of files, or accesses files outside the project directory, you get a notification. No configuration needed — it learns from your usage patterns.

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

Notifications only fire for warnings and criticals — info-level events are logged silently.

## How it works

agentwatch uses Claude Code's [hooks system](https://docs.anthropic.com/en/docs/claude-code/hooks):

1. **SessionStart hook** — records session metadata (cwd, model, timestamp)
2. **PostToolUse hook** — logs each tool invocation, sends macOS notification on critical risks
3. **Stop hook** — checks for anomalies vs your historical baseline, notifies if unusual
4. Logs stored as JSONL in `~/.agentwatch/sessions/`

The hooks run asynchronously with a 3-second timeout and silent failure — they never block or interfere with Claude Code.

## Data

All data stays local on your machine:

```
~/.agentwatch/
  sessions/
    <session-id>.jsonl    # one file per session, one JSON line per action
```

## Uninstall

```bash
agentwatch uninstall     # removes hooks from Claude Code settings
npm uninstall -g agentwatch
```

Session logs are preserved in `~/.agentwatch/` — delete manually if you want.

## Requirements

- Node.js 18+
- Claude Code

## Author

Created by **Farjad Ahmed**

## License

MIT
