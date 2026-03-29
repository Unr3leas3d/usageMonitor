# CLI Installer Design — `usage-monitor init`

## Problem

Installing usage-monitor requires multiple manual steps: cloning, running `install-claude-statusline`, editing tmux.conf, and running `npm link`. Users on a new machine must remember all these steps. We need a single interactive command that handles everything.

## Solution

Add `usage-monitor init` — an interactive setup wizard powered by `@clack/prompts` — and `usage-monitor uninstall` for teardown.

## Dependency Policy

`@clack/prompts` is added as the sole production dependency. **Only** `src/init.js` and `src/uninstall.js` import it. All existing commands (`tui`, `tmux-status`, `snapshot`) remain dependency-free at runtime and work without `npm install` if clack isn't needed.

## Commands

| Command | Description |
|---|---|
| `usage-monitor init` | Interactive setup wizard |
| `usage-monitor uninstall` | Interactive teardown |

Invocation: works via `node ./src/index.js init` after clone + `npm install`, or `npx usage-monitor init` once published to npm.

## Init Flow

Each step is individually skippable. If already configured, offers reinstall or skip.

### Step 1: Claude Statusline Bridge

- **Detect:** Check `~/.claude/settings.json` for `statusLine.command` pointing to our wrapper
- **If not installed:** Confirm -> call existing `installClaudeStatusline()` -> show result
- **If installed:** "Already configured. Reinstall?" -> confirm/skip

### Step 2: Tmux Integration

- **Detect:** Read `~/.tmux.conf` for `# usage-monitor` marker block
- **If not configured:**
  - Confirm
  - Backup `~/.tmux.conf` to `~/.tmux.conf.backup.{timestamp}` (if file exists)
  - Check for existing `status-right` line — warn and ask to replace or skip
  - Append marked block:
    ```
    # usage-monitor (auto-installed)
    set -g status-right '#(usage-monitor tmux-status)'
    set -g status-interval 2
    # /usage-monitor
    ```
  - If `~/.tmux.conf` doesn't exist, create it with just the block
  - If tmux is running (`tmux list-sessions`), reload via `tmux source-file ~/.tmux.conf`
  - If not running, inform user it takes effect next launch
- **If configured:** "Already configured. Reinstall?" -> confirm/skip

### Step 3: Global Command

- **Detect:** Run `which usage-monitor` to check PATH
- **If not available:** Confirm -> run `npm link` in project directory -> verify `usage-monitor` is on PATH
- **If available:** "Already on PATH. Reinstall?" -> confirm/skip

### Step 4: Summary

Outro with results: "Installed: Claude bridge, tmux. Skipped: global command. Failed: none."

## Uninstall Flow

### Step 1: Claude Bridge

- Confirm -> call existing `uninstallClaudeStatusline()`

### Step 2: Tmux Integration

- Confirm -> remove the marked block between `# usage-monitor` and `# /usage-monitor` from `~/.tmux.conf`
- Reload tmux if running

### Step 3: Global Command

- Confirm -> run `npm unlink` in project directory

### Step 4: Summary

Outro with what was removed.

## Error Handling

- Each step is wrapped in try/catch
- Failures are shown via Clack's `log.error()` and do not block subsequent steps
- The summary outro reports which steps succeeded, were skipped, or failed

## File Structure

| File | Purpose |
|---|---|
| `src/init.js` | Setup wizard — imports `@clack/prompts` |
| `src/uninstall.js` | Teardown flow — imports `@clack/prompts` |
| `src/tmux.js` | Tmux config read/write/detect helpers (no clack dependency) |
| `src/index.js` | Updated with `init` and `uninstall` case routes |
| `package.json` | Add `@clack/prompts` as dependency |

## Tmux Helpers (`src/tmux.js`)

Pure functions, no clack dependency, testable:

- `detectTmuxBlock(confPath)` — returns boolean, checks for marker block
- `backupTmuxConf(confPath)` — copies to `{confPath}.backup.{timestamp}`
- `appendTmuxBlock(confPath)` — appends the marked block
- `removeTmuxBlock(confPath)` — removes text between markers
- `hasExistingStatusRight(confPath)` — checks for pre-existing `status-right` line
- `isTmuxRunning()` — returns boolean
- `reloadTmux()` — runs `tmux source-file`

## Testing

- Unit tests for `src/tmux.js` helpers (file manipulation with temp dirs)
- Existing tests remain unchanged — no clack imports in tested modules
- Manual end-to-end: `node ./src/index.js init` on a clean machine
