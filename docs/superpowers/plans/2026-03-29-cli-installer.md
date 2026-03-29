# CLI Installer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `usage-monitor init` and `usage-monitor uninstall` commands — interactive Clack-powered wizards that set up (or tear down) the Claude bridge, tmux integration, and global CLI in one flow.

**Architecture:** New `src/tmux.js` for pure tmux config helpers, `src/init.js` for the setup wizard, `src/uninstall.js` for teardown. Only init/uninstall import `@clack/prompts`. Existing commands stay dependency-free. `src/index.js` gets two new case routes.

**Tech Stack:** Node.js >= 22, `@clack/prompts`, ES modules

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `package.json` | Modify | Add `@clack/prompts` dependency |
| `src/tmux.js` | Create | Pure tmux config read/write/detect helpers |
| `tests/tmux.test.js` | Create | Unit tests for tmux helpers |
| `src/init.js` | Create | Interactive setup wizard (imports clack) |
| `src/uninstall.js` | Create | Interactive teardown (imports clack) |
| `src/index.js` | Modify | Add `init` and `uninstall` case routes, update help text |

---

### Task 1: Install `@clack/prompts` and verify

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install the dependency**

Run:
```bash
cd "/Users/ayubmohamed/Vibe Coding Projects/usageMonitor"
npm install @clack/prompts
```

- [ ] **Step 2: Verify package.json has the dependency**

Run:
```bash
node -e "import('@clack/prompts').then(m => console.log('OK:', Object.keys(m).join(', ')))"
```
Expected: prints `OK:` followed by exported function names including `intro`, `outro`, `confirm`, `spinner`, `log`

- [ ] **Step 3: Verify existing tests still pass**

Run:
```bash
node --test
```
Expected: all 24 tests pass

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add @clack/prompts dependency for interactive CLI"
```

---

### Task 2: Create tmux helpers with tests (TDD)

**Files:**
- Create: `src/tmux.js`
- Create: `tests/tmux.test.js`

The tmux module is pure functions with no clack dependency. All functions take a `confPath` parameter for testability.

- [ ] **Step 1: Write failing tests for all tmux helpers**

Create `tests/tmux.test.js`:

```js
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

import {
  TMUX_BLOCK_START,
  TMUX_BLOCK_END,
  detectTmuxBlock,
  backupTmuxConf,
  appendTmuxBlock,
  removeTmuxBlock,
  hasExistingStatusRight,
} from "../src/tmux.js";

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tmux-test-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("detectTmuxBlock", () => {
  it("returns false when file does not exist", () => {
    assert.equal(detectTmuxBlock(path.join(tmpDir, "missing.conf")), false);
  });

  it("returns false when file has no marker", () => {
    const confPath = path.join(tmpDir, ".tmux.conf");
    fs.writeFileSync(confPath, "set -g mouse on\n");
    assert.equal(detectTmuxBlock(confPath), false);
  });

  it("returns true when file has the marker block", () => {
    const confPath = path.join(tmpDir, ".tmux.conf");
    fs.writeFileSync(
      confPath,
      `set -g mouse on\n${TMUX_BLOCK_START}\nset -g status-right '#(usage-monitor tmux-status)'\n${TMUX_BLOCK_END}\n`
    );
    assert.equal(detectTmuxBlock(confPath), true);
  });
});

describe("hasExistingStatusRight", () => {
  it("returns false when file does not exist", () => {
    assert.equal(hasExistingStatusRight(path.join(tmpDir, "missing.conf")), false);
  });

  it("returns false when no status-right line", () => {
    const confPath = path.join(tmpDir, ".tmux.conf");
    fs.writeFileSync(confPath, "set -g mouse on\n");
    assert.equal(hasExistingStatusRight(confPath), false);
  });

  it("returns true when status-right line exists outside our block", () => {
    const confPath = path.join(tmpDir, ".tmux.conf");
    fs.writeFileSync(confPath, "set -g status-right '#H'\n");
    assert.equal(hasExistingStatusRight(confPath), true);
  });

  it("returns false when status-right is only inside our block", () => {
    const confPath = path.join(tmpDir, ".tmux.conf");
    fs.writeFileSync(
      confPath,
      `${TMUX_BLOCK_START}\nset -g status-right '#(usage-monitor tmux-status)'\n${TMUX_BLOCK_END}\n`
    );
    assert.equal(hasExistingStatusRight(confPath), false);
  });
});

describe("backupTmuxConf", () => {
  it("creates a timestamped backup copy", () => {
    const confPath = path.join(tmpDir, ".tmux.conf");
    fs.writeFileSync(confPath, "original content\n");
    const backupPath = backupTmuxConf(confPath);
    assert.ok(fs.existsSync(backupPath));
    assert.equal(fs.readFileSync(backupPath, "utf8"), "original content\n");
    assert.match(path.basename(backupPath), /^\.tmux\.conf\.backup\.\d+$/);
  });

  it("returns null when file does not exist", () => {
    assert.equal(backupTmuxConf(path.join(tmpDir, "missing.conf")), null);
  });
});

describe("appendTmuxBlock", () => {
  it("appends block to existing file", () => {
    const confPath = path.join(tmpDir, ".tmux.conf");
    fs.writeFileSync(confPath, "set -g mouse on\n");
    appendTmuxBlock(confPath);
    const content = fs.readFileSync(confPath, "utf8");
    assert.ok(content.includes(TMUX_BLOCK_START));
    assert.ok(content.includes("usage-monitor tmux-status"));
    assert.ok(content.includes(TMUX_BLOCK_END));
    assert.ok(content.startsWith("set -g mouse on\n"));
  });

  it("creates new file with block when file does not exist", () => {
    const confPath = path.join(tmpDir, ".tmux.conf");
    appendTmuxBlock(confPath);
    const content = fs.readFileSync(confPath, "utf8");
    assert.ok(content.includes(TMUX_BLOCK_START));
    assert.ok(content.includes("usage-monitor tmux-status"));
  });
});

describe("removeTmuxBlock", () => {
  it("removes the marker block and preserves surrounding content", () => {
    const confPath = path.join(tmpDir, ".tmux.conf");
    fs.writeFileSync(
      confPath,
      `set -g mouse on\n${TMUX_BLOCK_START}\nset -g status-right '#(usage-monitor tmux-status)'\nset -g status-interval 2\n${TMUX_BLOCK_END}\nset -g base-index 1\n`
    );
    const removed = removeTmuxBlock(confPath);
    assert.equal(removed, true);
    const content = fs.readFileSync(confPath, "utf8");
    assert.ok(!content.includes(TMUX_BLOCK_START));
    assert.ok(!content.includes("usage-monitor"));
    assert.ok(content.includes("set -g mouse on"));
    assert.ok(content.includes("set -g base-index 1"));
  });

  it("returns false when no block found", () => {
    const confPath = path.join(tmpDir, ".tmux.conf");
    fs.writeFileSync(confPath, "set -g mouse on\n");
    assert.equal(removeTmuxBlock(confPath), false);
  });

  it("returns false when file does not exist", () => {
    assert.equal(removeTmuxBlock(path.join(tmpDir, "missing.conf")), false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
node --test tests/tmux.test.js
```
Expected: FAIL — module `../src/tmux.js` does not exist

- [ ] **Step 3: Implement `src/tmux.js`**

Create `src/tmux.js`:

```js
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";

import { pathExists } from "./paths.js";

export const TMUX_BLOCK_START = "# usage-monitor (auto-installed)";
export const TMUX_BLOCK_END = "# /usage-monitor";

const TMUX_BLOCK_BODY = [
  "set -g status-right '#(usage-monitor tmux-status)'",
  "set -g status-interval 2",
].join("\n");

export function defaultTmuxConfPath() {
  return path.join(os.homedir(), ".tmux.conf");
}

export function detectTmuxBlock(confPath) {
  if (!pathExists(confPath)) {
    return false;
  }

  const content = fs.readFileSync(confPath, "utf8");
  return content.includes(TMUX_BLOCK_START);
}

export function hasExistingStatusRight(confPath) {
  if (!pathExists(confPath)) {
    return false;
  }

  const content = fs.readFileSync(confPath, "utf8");
  const blockStartIndex = content.indexOf(TMUX_BLOCK_START);
  const blockEndIndex = content.indexOf(TMUX_BLOCK_END);

  const lines = content.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!/^set\s.*status-right\s/.test(trimmed)) {
      continue;
    }

    // Check if this line is inside our block
    const lineIndex = content.indexOf(line);
    if (
      blockStartIndex !== -1 &&
      blockEndIndex !== -1 &&
      lineIndex > blockStartIndex &&
      lineIndex < blockEndIndex
    ) {
      continue;
    }

    return true;
  }

  return false;
}

export function backupTmuxConf(confPath) {
  if (!pathExists(confPath)) {
    return null;
  }

  const backupPath = `${confPath}.backup.${Date.now()}`;
  fs.copyFileSync(confPath, backupPath);
  return backupPath;
}

export function appendTmuxBlock(confPath) {
  const block = `${TMUX_BLOCK_START}\n${TMUX_BLOCK_BODY}\n${TMUX_BLOCK_END}\n`;

  if (pathExists(confPath)) {
    const existing = fs.readFileSync(confPath, "utf8");
    const separator = existing.endsWith("\n") ? "" : "\n";
    fs.writeFileSync(confPath, existing + separator + block);
  } else {
    fs.writeFileSync(confPath, block);
  }
}

export function removeTmuxBlock(confPath) {
  if (!pathExists(confPath)) {
    return false;
  }

  const content = fs.readFileSync(confPath, "utf8");
  const startIndex = content.indexOf(TMUX_BLOCK_START);
  const endIndex = content.indexOf(TMUX_BLOCK_END);

  if (startIndex === -1 || endIndex === -1) {
    return false;
  }

  const before = content.slice(0, startIndex);
  const after = content.slice(endIndex + TMUX_BLOCK_END.length);
  const cleaned = (before + after).replace(/\n{3,}/g, "\n\n").trim() + "\n";
  fs.writeFileSync(confPath, cleaned === "\n" ? "" : cleaned);
  return true;
}

export function isTmuxRunning() {
  try {
    execFileSync("tmux", ["list-sessions"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return true;
  } catch {
    return false;
  }
}

export function reloadTmux(confPath) {
  execFileSync("tmux", ["source-file", confPath], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
node --test tests/tmux.test.js
```
Expected: all tests pass

- [ ] **Step 5: Run full test suite**

Run:
```bash
node --test
```
Expected: all tests pass (existing + new)

- [ ] **Step 6: Commit**

```bash
git add src/tmux.js tests/tmux.test.js
git commit -m "feat: add tmux config helpers with tests"
```

---

### Task 3: Create the init wizard

**Files:**
- Create: `src/init.js`

- [ ] **Step 1: Create `src/init.js`**

```js
import { execFileSync } from "node:child_process";
import { intro, outro, confirm, spinner, log, isCancel } from "@clack/prompts";

import { installClaudeStatusline } from "./install-claude-statusline.js";
import { getClaudePaths } from "./paths.js";
import { loadJsonFile } from "./cache.js";
import {
  defaultTmuxConfPath,
  detectTmuxBlock,
  hasExistingStatusRight,
  backupTmuxConf,
  appendTmuxBlock,
  isTmuxRunning,
  reloadTmux,
} from "./tmux.js";

function cancelled() {
  outro("Setup cancelled.");
  process.exit(0);
}

function detectClaudeBridge() {
  const { settingsPath, localStatuslineScriptPath } = getClaudePaths();
  const settings = loadJsonFile(settingsPath, {});
  const command = settings.statusLine?.command || "";
  return command.includes("usage-monitor-statusline");
}

function detectGlobalCommand() {
  try {
    execFileSync("which", ["usage-monitor"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return true;
  } catch {
    return false;
  }
}

async function stepClaudeBridge() {
  const installed = detectClaudeBridge();
  const prompt = installed
    ? "Claude statusline bridge is already installed. Reinstall?"
    : "Install the Claude statusline bridge?";

  const answer = await confirm({ message: prompt });
  if (isCancel(answer)) { cancelled(); }
  if (!answer) { return "skipped"; }

  const s = spinner();
  s.start("Installing Claude statusline bridge...");
  try {
    const result = installClaudeStatusline();
    s.stop("Claude statusline bridge installed.");
    log.success(`Script: ${result.scriptPath}`);
    if (result.delegated) {
      log.info("Preserved previous status line command for delegation.");
    }
    return "installed";
  } catch (error) {
    s.stop("Failed to install Claude statusline bridge.");
    log.error(error.message);
    return "failed";
  }
}

async function stepTmux() {
  const confPath = defaultTmuxConfPath();
  const blockExists = detectTmuxBlock(confPath);
  const prompt = blockExists
    ? "Tmux integration is already configured. Reinstall?"
    : "Add usage-monitor to your tmux status bar?";

  const answer = await confirm({ message: prompt });
  if (isCancel(answer)) { cancelled(); }
  if (!answer) { return "skipped"; }

  const s = spinner();
  s.start("Configuring tmux...");
  try {
    if (hasExistingStatusRight(confPath) && !blockExists) {
      s.stop("Existing status-right found in tmux.conf.");
      const replace = await confirm({
        message: "Your tmux.conf already has a status-right line. Replace it?",
      });
      if (isCancel(replace)) { cancelled(); }
      if (!replace) {
        log.info("Skipped tmux — existing status-right preserved.");
        return "skipped";
      }
      s.start("Configuring tmux...");
    }

    const backupPath = backupTmuxConf(confPath);
    if (backupPath) {
      log.info(`Backed up tmux.conf to ${backupPath}`);
    }

    appendTmuxBlock(confPath);
    s.stop("Tmux integration configured.");

    if (isTmuxRunning()) {
      try {
        reloadTmux(confPath);
        log.success("Tmux config reloaded.");
      } catch {
        log.warning("Could not reload tmux — run `tmux source-file ~/.tmux.conf` manually.");
      }
    } else {
      log.info("Tmux is not running. Config will take effect on next launch.");
    }

    return "installed";
  } catch (error) {
    s.stop("Failed to configure tmux.");
    log.error(error.message);
    return "failed";
  }
}

async function stepGlobalCommand() {
  const available = detectGlobalCommand();
  const prompt = available
    ? "usage-monitor is already on your PATH. Reinstall?"
    : "Make usage-monitor available as a global command?";

  const answer = await confirm({ message: prompt });
  if (isCancel(answer)) { cancelled(); }
  if (!answer) { return "skipped"; }

  const s = spinner();
  s.start("Running npm link...");
  try {
    execFileSync("npm", ["link"], {
      cwd: import.meta.dirname,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    s.stop("Global command installed.");
    log.success("You can now run `usage-monitor` from anywhere.");
    return "installed";
  } catch (error) {
    s.stop("Failed to link global command.");
    log.error(error.message);
    return "failed";
  }
}

function formatSummary(results) {
  const groups = { installed: [], skipped: [], failed: [] };
  for (const [name, status] of Object.entries(results)) {
    groups[status].push(name);
  }

  const parts = [];
  if (groups.installed.length) { parts.push(`Installed: ${groups.installed.join(", ")}`); }
  if (groups.skipped.length) { parts.push(`Skipped: ${groups.skipped.join(", ")}`); }
  if (groups.failed.length) { parts.push(`Failed: ${groups.failed.join(", ")}`); }
  return parts.join(". ") + ".";
}

export async function runInit() {
  intro("usage-monitor setup");

  const results = {};
  results["Claude bridge"] = await stepClaudeBridge();
  results["Tmux"] = await stepTmux();
  results["Global command"] = await stepGlobalCommand();

  outro(formatSummary(results));
}
```

- [ ] **Step 2: Verify it loads without errors**

Run:
```bash
node -e "import('./src/init.js').then(() => console.log('OK'))"
```
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add src/init.js
git commit -m "feat: add interactive init wizard"
```

---

### Task 4: Create the uninstall wizard

**Files:**
- Create: `src/uninstall.js`

- [ ] **Step 1: Create `src/uninstall.js`**

```js
import { execFileSync } from "node:child_process";
import { intro, outro, confirm, spinner, log, isCancel } from "@clack/prompts";

import { uninstallClaudeStatusline } from "./install-claude-statusline.js";
import {
  defaultTmuxConfPath,
  detectTmuxBlock,
  removeTmuxBlock,
  isTmuxRunning,
  reloadTmux,
} from "./tmux.js";

function cancelled() {
  outro("Uninstall cancelled.");
  process.exit(0);
}

async function stepClaudeBridge() {
  const answer = await confirm({ message: "Remove the Claude statusline bridge?" });
  if (isCancel(answer)) { cancelled(); }
  if (!answer) { return "skipped"; }

  const s = spinner();
  s.start("Removing Claude statusline bridge...");
  try {
    const result = uninstallClaudeStatusline();
    s.stop("Claude statusline bridge removed.");
    if (result.restored) {
      log.info("Restored previous status line command.");
    }
    return "removed";
  } catch (error) {
    s.stop("Failed to remove Claude statusline bridge.");
    log.error(error.message);
    return "failed";
  }
}

async function stepTmux() {
  const confPath = defaultTmuxConfPath();
  if (!detectTmuxBlock(confPath)) {
    log.info("Tmux integration is not configured. Skipping.");
    return "skipped";
  }

  const answer = await confirm({ message: "Remove usage-monitor from tmux.conf?" });
  if (isCancel(answer)) { cancelled(); }
  if (!answer) { return "skipped"; }

  const s = spinner();
  s.start("Removing tmux integration...");
  try {
    removeTmuxBlock(confPath);
    s.stop("Tmux integration removed.");

    if (isTmuxRunning()) {
      try {
        reloadTmux(confPath);
        log.success("Tmux config reloaded.");
      } catch {
        log.warning("Could not reload tmux — run `tmux source-file ~/.tmux.conf` manually.");
      }
    }

    return "removed";
  } catch (error) {
    s.stop("Failed to remove tmux integration.");
    log.error(error.message);
    return "failed";
  }
}

async function stepGlobalCommand() {
  const answer = await confirm({ message: "Remove the global usage-monitor command?" });
  if (isCancel(answer)) { cancelled(); }
  if (!answer) { return "skipped"; }

  const s = spinner();
  s.start("Running npm unlink...");
  try {
    execFileSync("npm", ["unlink"], {
      cwd: import.meta.dirname,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    s.stop("Global command removed.");
    return "removed";
  } catch (error) {
    s.stop("Failed to unlink global command.");
    log.error(error.message);
    return "failed";
  }
}

function formatSummary(results) {
  const groups = { removed: [], skipped: [], failed: [] };
  for (const [name, status] of Object.entries(results)) {
    groups[status].push(name);
  }

  const parts = [];
  if (groups.removed.length) { parts.push(`Removed: ${groups.removed.join(", ")}`); }
  if (groups.skipped.length) { parts.push(`Skipped: ${groups.skipped.join(", ")}`); }
  if (groups.failed.length) { parts.push(`Failed: ${groups.failed.join(", ")}`); }
  return parts.join(". ") + ".";
}

export async function runUninstall() {
  intro("usage-monitor uninstall");

  const results = {};
  results["Claude bridge"] = await stepClaudeBridge();
  results["Tmux"] = await stepTmux();
  results["Global command"] = await stepGlobalCommand();

  outro(formatSummary(results));
}
```

- [ ] **Step 2: Verify it loads without errors**

Run:
```bash
node -e "import('./src/uninstall.js').then(() => console.log('OK'))"
```
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add src/uninstall.js
git commit -m "feat: add interactive uninstall wizard"
```

---

### Task 5: Wire init and uninstall into index.js

**Files:**
- Modify: `src/index.js`

- [ ] **Step 1: Add imports at the top of `src/index.js`**

After the existing imports (line 6), add:

```js
import { runInit } from "./init.js";
import { runUninstall } from "./uninstall.js";
```

- [ ] **Step 2: Update helpText function**

Replace the existing `helpText()` function body with:

```js
function helpText() {
  return `usage-monitor

Commands:
  usage-monitor init                              Interactive setup wizard
  usage-monitor uninstall                         Interactive teardown
  usage-monitor tui                               Terminal dashboard
  usage-monitor tmux-status [--max-age=<ms>] [--no-cache]  Tmux status line
  usage-monitor snapshot [--json]                  Snapshot of active agents
  usage-monitor install-claude-statusline          Install Claude bridge (non-interactive)
  usage-monitor uninstall-claude-statusline         Remove Claude bridge (non-interactive)
`;
}
```

- [ ] **Step 3: Add case routes in the switch statement**

Add these two cases before the `case "tui":` line (before line 87):

```js
    case "init":
      await runInit();
      return;

    case "uninstall":
      await runUninstall();
      return;
```

- [ ] **Step 4: Verify existing tests still pass**

Run:
```bash
node --test
```
Expected: all tests pass

- [ ] **Step 5: Verify help text shows new commands**

Run:
```bash
node ./src/index.js help
```
Expected: output includes `init` and `uninstall` commands

- [ ] **Step 6: Commit**

```bash
git add src/index.js
git commit -m "feat: wire init and uninstall commands into CLI"
```

---

### Task 6: End-to-end manual verification

- [ ] **Step 1: Run the full test suite**

Run:
```bash
node --test
```
Expected: all tests pass

- [ ] **Step 2: Test init command starts correctly**

Run:
```bash
node ./src/index.js init
```
Expected: Clack intro appears with "usage-monitor setup", first prompt asks about Claude bridge. Press Ctrl+C to exit.

- [ ] **Step 3: Test uninstall command starts correctly**

Run:
```bash
node ./src/index.js uninstall
```
Expected: Clack intro appears with "usage-monitor uninstall", first prompt asks about Claude bridge. Press Ctrl+C to exit.

- [ ] **Step 4: Verify existing commands are unaffected**

Run:
```bash
node ./src/index.js snapshot --json
```
Expected: JSON output (or empty snapshot) — no clack imports loaded

- [ ] **Step 5: Final commit if any cleanup needed**

```bash
git add -A
git commit -m "chore: final cleanup for CLI installer"
```
