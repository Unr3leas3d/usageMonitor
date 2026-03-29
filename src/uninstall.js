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

  const answer = await confirm({ message: "Remove vibe-meter from tmux.conf?" });
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
  const answer = await confirm({ message: "Remove the global vibe-meter command?" });
  if (isCancel(answer)) { cancelled(); }
  if (!answer) { return "skipped"; }

  const s = spinner();
  s.start("Running npm unlink...");
  try {
    execFileSync("npm", ["rm", "-g", "vibe-meter"], {
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
  intro("vibe-meter uninstall");

  const results = {};
  results["Claude bridge"] = await stepClaudeBridge();
  results["Tmux"] = await stepTmux();
  results["Global command"] = await stepGlobalCommand();

  outro(formatSummary(results));
}
