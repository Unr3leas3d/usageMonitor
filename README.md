# vibe-meter

A Node.js CLI that monitors live Claude Code and Codex sessions from the terminal.

## Requirements

- Node.js >= 22
- macOS or Linux
- Claude Code >= 2.1.80 (for rate-limit data)

## Quick Start

```bash
git clone https://github.com/Unr3leas3d/usageMonitor.git
cd usageMonitor
npm install
node ./src/index.js init
```

The interactive setup wizard will walk you through:

1. **Claude statusline bridge** — live 5h and 7d usage data from Claude Code
2. **Tmux integration** — usage stats in your tmux status bar
3. **Global command** — makes `vibe-meter` available from anywhere

## Commands

```bash
# Interactive setup / teardown
vibe-meter init
vibe-meter uninstall

# Terminal dashboard
vibe-meter tui

# Tmux status bar output
vibe-meter tmux-status

# JSON snapshot of all active agents
vibe-meter snapshot --json
```

If you haven't run `vibe-meter init` to set up the global command, prefix with `node ./src/index.js`:

```bash
node ./src/index.js tui
```

## Manual Setup

If you prefer to set things up individually instead of using `init`:

### Claude Statusline Bridge

```bash
node ./src/index.js install-claude-statusline
```

Claude Code must be `2.1.80` or newer for the status line to include `rate_limits`. This preserves your prior Claude status line command and restores it on uninstall.

### Tmux Integration

Add this to your `~/.tmux.conf`:

```tmux
set -g status-right '#(vibe-meter tmux-status)'
set -g status-interval 2
```

Then reload tmux:

```bash
tmux source-file ~/.tmux.conf
```

## Uninstall

```bash
vibe-meter uninstall
```

This interactively removes the Claude bridge, tmux config block, and global command.

## Running Tests

```bash
node --test
```
