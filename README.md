# usage-monitor

A zero-dependency Node CLI that monitors live Claude Code and Codex sessions from the terminal.

## Commands

```bash
usage-monitor tui
usage-monitor tmux-status
usage-monitor snapshot --json
usage-monitor install-claude-statusline
usage-monitor uninstall-claude-statusline
```

## Tmux

Add this to your tmux config:

```tmux
set -g status-right '#(cd "/Users/ayubmohamed/Vibe Coding Projects/usageMonitor" && node ./src/index.js tmux-status)'
```

## Claude Bridge

Install the Claude status line bridge once if you want live 5-hour and 7-day Claude usage:

```bash
cd "/Users/ayubmohamed/Vibe Coding Projects/usageMonitor"
node ./src/index.js install-claude-statusline
```

Claude Code must be `2.1.80` or newer for the status line to include `rate_limits`.

This preserves your prior Claude status line command and restores it on uninstall.
