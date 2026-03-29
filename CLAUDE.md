# vibe-meter

A Node.js CLI that monitors live Claude Code and Codex sessions from the terminal. Provides a TUI dashboard, tmux status bar integration, and a Claude statusline bridge for rate-limit data.

## Commands

```bash
vibe-meter init                    # Interactive setup wizard
vibe-meter uninstall               # Interactive teardown
vibe-meter tui                     # Interactive terminal dashboard
vibe-meter tmux-status             # One-line status for tmux status bar
vibe-meter snapshot --json         # JSON snapshot of all active agents
vibe-meter install-claude-statusline   # Install Claude statusline bridge
vibe-meter uninstall-claude-statusline # Remove the bridge
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
- **`src/tmux.js`** — Pure tmux config helpers (detect/append/remove marker blocks)
- **`src/init.js`** — Interactive setup wizard (Clack-powered)
- **`src/uninstall.js`** — Interactive teardown wizard (Clack-powered)

## Conventions

- **Minimal dependencies** — `@clack/prompts` is the sole production dependency (used only by init/uninstall). Core monitoring commands use only Node.js built-ins.
- **ES modules** — all files use `import`/`export` (package.json has `"type": "module"`)
- **Node >= 22** required
- **Tests** — run with `node --test` (Node's built-in test runner). Test files live in `tests/`.
- **No build step** — source JS is executed directly
- **Synchronous I/O** — most file/process operations use sync APIs (`fs.readFileSync`, `execFileSync`) for simplicity in the CLI hot path
- **Pure functions** — utility and inference functions are kept pure and testable; side effects are isolated in collectors and cache modules
