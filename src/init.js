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
  return command.includes("vibe-meter-statusline");
}

function detectGlobalCommand() {
  try {
    execFileSync("which", ["vibe-meter"], {
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
    : "Add vibe-meter to your tmux status bar?";

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
    ? "vibe-meter is already on your PATH. Reinstall?"
    : "Make vibe-meter available as a global command?";

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
    log.success("You can now run `vibe-meter` from anywhere.");
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
  intro("vibe-meter setup");

  const results = {};
  results["Claude bridge"] = await stepClaudeBridge();
  results["Tmux"] = await stepTmux();
  results["Global command"] = await stepGlobalCommand();

  outro(formatSummary(results));
}
