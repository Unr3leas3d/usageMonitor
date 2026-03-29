# usage-monitor

A zero-dependency Node.js CLI that monitors live Claude Code and Codex sessions from the terminal.

## Requirements

- Node.js >= 22
- macOS or Linux
- Claude Code >= 2.1.80 (for rate-limit data)

## Installation

```bash
git clone https://github.com/Unr3leas3d/usageMonitor.git
cd usageMonitor
```

No `npm install` needed — the project has zero dependencies.

Optionally, make it available globally:

```bash
npm link
```

Or run directly:

```bash
node ./src/index.js <command>
```

## Commands

```bash
# Interactive terminal dashboard
node ./src/index.js tui

# One-line status for tmux status bar
node ./src/index.js tmux-status

# JSON snapshot of all active agents
node ./src/index.js snapshot --json

# Install/uninstall the Claude statusline bridge
node ./src/index.js install-claude-statusline
node ./src/index.js uninstall-claude-statusline
```

## Setup

### Claude Statusline Bridge

Install the bridge to get live 5-hour and 7-day usage data from Claude Code:

```bash
node ./src/index.js install-claude-statusline
```

Claude Code must be `2.1.80` or newer for the status line to include `rate_limits`.

This preserves your prior Claude status line command and restores it on uninstall.

### Tmux Integration

Add this to your `~/.tmux.conf` (adjust the path to where you cloned the repo):

```tmux
set -g status-right '#(cd ~/usageMonitor && node ./src/index.js tmux-status)'
```

Then reload tmux:

```bash
tmux source-file ~/.tmux.conf
```

## Running Tests

```bash
node --test
```
