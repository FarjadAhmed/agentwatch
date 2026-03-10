# agentwatch

See what AI coding agents do on your machine.

agentwatch hooks into Claude Code and silently logs every action — bash commands, file reads/writes, web fetches, agent spawns — then lets you review what happened through a CLI or web dashboard.

## Why

AI coding agents run commands on your machine. You approve them, but do you actually read every one? agentwatch gives you:

- **Full session audit trail** — every tool call logged with timestamps
- **Danger detection** — flags `rm -rf`, `curl | sh`, secrets access, sudo, force pushes
- **Visual DAG** — see the flow of actions with file dependency edges
- **Zero overhead** — hooks run async, never blocks Claude Code

## Install

```bash
npm install -g agentwatch
agentwatch install
```

That's it. Two commands. agentwatch is now logging every Claude Code session.

## Usage

After any Claude Code session:

```bash
agentwatch last          # what just happened?
agentwatch danger        # anything risky?
agentwatch dash          # open web dashboard
```

### All commands

```
agentwatch sessions      # list all recorded sessions
agentwatch last          # review the most recent session
agentwatch show <id>     # show a specific session by ID prefix
agentwatch live          # live-follow current session in terminal
agentwatch commands      # all bash commands from latest session
agentwatch files         # all files touched (Read/Edit/Write)
agentwatch danger        # flag potentially dangerous actions
agentwatch dash          # open web dashboard at localhost:3737
agentwatch stats         # aggregate stats across all sessions
agentwatch prune [days]  # delete sessions older than N days (default: 30)
agentwatch status        # check if agentwatch is installed and working
agentwatch install       # add hooks to Claude Code
agentwatch uninstall     # remove hooks (logs are preserved)
```

## Web Dashboard

`agentwatch dash` opens a local dashboard at `localhost:3737` with:

- **DAG view** — action flow graph with nodes sized by command length, color-coded by tool type, file dependency edges, risk indicators
- **Timeline** — chronological list of all actions
- **Commands** — every bash command with timestamps
- **Files** — every file touched with Read/Edit/Write badges
- **Danger alerts** — risky actions highlighted at the top
- **Auto-refresh** — updates every 2 seconds while Claude Code is running

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

## How it works

agentwatch uses Claude Code's [hooks system](https://docs.anthropic.com/en/docs/claude-code/hooks):

1. **SessionStart hook** — records session metadata (cwd, model, timestamp) as first JSONL entry
2. **PostToolUse hook** — appends each tool invocation to the session JSONL file
3. Logs are stored as JSONL files in `~/.agentwatch/sessions/`
4. The session index is computed on demand from JSONL files — no shared mutable state

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

## License

MIT
