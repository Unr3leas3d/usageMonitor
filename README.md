# vibe-meter

A Node.js CLI that monitors live **Claude Code** and **Codex** sessions from the terminal. Provides a TUI dashboard, tmux status bar integration, and a Claude statusline bridge for rate-limit data.

## Features

- **TUI Dashboard** — interactive terminal UI showing all active AI coding sessions
- **Tmux Integration** — live usage stats in your tmux status bar
- **Claude Statusline Bridge** — captures 5h and 7d rate-limit data from Claude Code
- **Codex Support** — discovers and monitors Codex sessions via SQLite logs
- **JSON Snapshots** — machine-readable output for scripting and tooling

## Requirements

- Node.js >= 22
- macOS or Linux
- Claude Code >= 2.1.80 (for rate-limit data)

## Install

### From npm

```bash
npm install -g vibe-meter
```

### From source

```bash
git clone https://github.com/Unr3leas3d/usageMonitor.git
cd usageMonitor
npm install
node ./src/index.js init
```

The wizard walks you through:

1. **Claude statusline bridge** — live 5h and 7d usage data from Claude Code
2. **Tmux integration** — usage stats in your tmux status bar
3. **Global command** — makes `vibe-meter` available from anywhere

## Commands

```bash
vibe-meter init                          # Interactive setup wizard
vibe-meter update                        # Self-update (auto-detects install method)
vibe-meter uninstall                     # Interactive teardown

vibe-meter tui                           # Interactive terminal dashboard
vibe-meter tmux-status                   # One-line status for tmux status bar
vibe-meter snapshot --json               # JSON snapshot of all active agents

vibe-meter install-claude-statusline     # Install Claude statusline bridge
vibe-meter uninstall-claude-statusline   # Remove the bridge
```

If you haven't set up the global command, prefix with `node ./src/index.js`:

```bash
node ./src/index.js tui
```

## Manual Setup

If you prefer to configure things individually instead of using `init`:

### Claude Statusline Bridge

```bash
vibe-meter install-claude-statusline
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

## Architecture

| File | Purpose |
|------|---------|
| `src/index.js` | CLI entrypoint and command routing |
| `src/snapshot.js` | Builds/caches snapshots of all active agents |
| `src/collectors/claude.js` | Discovers Claude sessions via `ps`, reads JSONL transcripts |
| `src/collectors/codex.js` | Discovers Codex sessions via SQLite logs |
| `src/inference.js` | Infers agent state (thinking/typing/reading/idle) |
| `src/tui.js` | Terminal UI dashboard |
| `src/tmux.js` | Tmux config helpers |
| `src/init.js` | Interactive setup wizard |
| `src/uninstall.js` | Interactive teardown wizard |
| `src/install-claude-statusline.js` | Claude statusline bridge installer |
| `src/processes.js` | Process/file discovery via `ps` and `lsof` |
| `src/paths.js` | Platform-aware path helpers |
| `src/cache.js` | JSON file read/write and snapshot caching |
| `src/jsonl.js` | Efficient tail-reading of JSONL transcripts |
| `src/utils.js` | Pure utility functions |

## Running Tests

```bash
node --test
```

## Uninstall

```bash
vibe-meter uninstall
```

This interactively removes the Claude bridge, tmux config block, and global command.

## License

MIT
