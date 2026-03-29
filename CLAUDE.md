# usage-monitor

A zero-dependency Node.js CLI that monitors live Claude Code and Codex sessions from the terminal. Provides a TUI dashboard, tmux status bar integration, and a Claude statusline bridge for rate-limit data.

## Commands

```bash
node ./src/index.js tui            # Interactive terminal dashboard
node ./src/index.js tmux-status    # One-line status for tmux status bar
node ./src/index.js snapshot --json # JSON snapshot of all active agents
node ./src/index.js install-claude-statusline   # Install Claude statusline bridge
node ./src/index.js uninstall-claude-statusline # Remove the bridge
```

## Architecture

- **`src/index.js`** — CLI entrypoint, command routing, tmux formatting
- **`src/snapshot.js`** — Builds/caches snapshots of all active agents and usage
- **`src/collectors/claude.js`** — Discovers Claude sessions via `ps`, reads JSONL transcripts and statusline bridge snapshots
- **`src/collectors/codex.js`** — Discovers Codex sessions via SQLite logs DB and JSONL transcripts
- **`src/inference.js`** — Infers agent state (thinking/typing/reading/idle) from transcript entries; normalizes rate-limit usage
- **`src/processes.js`** — Wraps `ps` and `lsof` for process/file discovery
- **`src/paths.js`** — Platform-aware path helpers for `~/.claude`, `~/.codex`, and app cache dirs
- **`src/cache.js`** — JSON file read/write helpers and snapshot caching
- **`src/jsonl.js`** — Efficient tail-reading of JSONL transcript files
- **`src/utils.js`** — Pure utility functions (duration formatting, semver comparison, JSON parsing)
- **`src/tui.js`** — Terminal UI dashboard
- **`src/install-claude-statusline.js`** — Installs/uninstalls the Claude statusline bridge script

## Conventions

- **Zero dependencies** — only Node.js built-ins (`fs`, `path`, `os`, `child_process`). Do not add npm dependencies.
- **ES modules** — all files use `import`/`export` (package.json has `"type": "module"`)
- **Node >= 22** required
- **Tests** — run with `node --test` (Node's built-in test runner). Test files live in `tests/`.
- **No build step** — source JS is executed directly
- **Synchronous I/O** — most file/process operations use sync APIs (`fs.readFileSync`, `execFileSync`) for simplicity in the CLI hot path
- **Pure functions** — utility and inference functions are kept pure and testable; side effects are isolated in collectors and cache modules
