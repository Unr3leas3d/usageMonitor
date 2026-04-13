#!/usr/bin/env node

import { getSnapshot } from "./snapshot.js";
import { runTui } from "./tui.js";
import { installClaudeStatusline, uninstallClaudeStatusline } from "./install-claude-statusline.js";
import { formatResetCountdown } from "./utils.js";
import { runInit } from "./init.js";
import { runUninstall } from "./uninstall.js";
import { runUpdate } from "./update.js";

function helpText() {
  return `vibe-meter

Commands:
  vibe-meter init                              Interactive setup wizard
  vibe-meter update                            Self-update (auto-detects install method)
  vibe-meter uninstall                         Interactive teardown
  vibe-meter tui                               Terminal dashboard
  vibe-meter tmux-status [--max-age=<ms>] [--no-cache]  Tmux status line
  vibe-meter snapshot [--json]                  Snapshot of active agents
  vibe-meter install-claude-statusline          Install Claude bridge (non-interactive)
  vibe-meter uninstall-claude-statusline         Remove Claude bridge (non-interactive)
`;
}

export function parseMaxAge(args) {
  if (args.includes("--no-cache")) {
    return 0;
  }

  const flag = args.find((arg) => arg.startsWith("--max-age="));
  if (flag) {
    const value = Number.parseInt(flag.split("=")[1], 10);
    if (Number.isFinite(value) && value >= 0) {
      return value;
    }
  }

  return 1_500;
}

function formatRuntimeSummary(label, windows) {
  if (!windows?.length) {
    return null;
  }

  return `${label} ${windows.map((window) => {
    const pct = window.usedPct != null ? Math.round(window.usedPct) + "%" : "-%";
    if (window.usedPct != null && window.usedPct >= 100) {
      const countdown = formatResetCountdown(window.resetsAt);
      if (countdown) {
        return `${window.label} ${pct} (${countdown})`;
      }
    }
    return `${window.label} ${pct}`;
  }).join(" ")}`;
}

function renderTmuxStatus(snapshot) {
  return [
    formatRuntimeSummary("Claude", snapshot.aggregateUsage.claude),
    formatRuntimeSummary("Codex", snapshot.aggregateUsage.codex),
    `${snapshot.agents.length} active`
  ].filter(Boolean).join(" | ");
}

async function main() {
  const [command = "help", ...args] = process.argv.slice(2);

  switch (command) {
    case "help":
    case "--help":
    case "-h":
      console.log(helpText());
      return;

    case "snapshot": {
      const snapshot = getSnapshot();
      if (args.includes("--json")) {
        console.log(JSON.stringify(snapshot, null, 2));
      } else {
        console.log(renderTmuxStatus(snapshot));
      }
      return;
    }

    case "tmux-status": {
      const snapshot = getSnapshot({ preferCache: true, maxCacheAgeMs: parseMaxAge(args) });
      process.stdout.write(renderTmuxStatus(snapshot));
      return;
    }

    case "update":
      await runUpdate();
      return;

    case "init":
      await runInit();
      return;

    case "uninstall":
      await runUninstall();
      return;

    case "tui":
      await runTui();
      return;

    case "install-claude-statusline": {
      const result = installClaudeStatusline();
      console.log(`Installed Claude statusline bridge at ${result.scriptPath}`);
      console.log(`Updated ${result.settingsPath}`);
      if (result.delegated) {
        console.log("Preserved the previous Claude status line command for delegation.");
      }
      return;
    }

    case "uninstall-claude-statusline": {
      const result = uninstallClaudeStatusline();
      console.log(`Updated ${result.settingsPath}`);
      console.log(result.restored ? "Restored the previous Claude status line." : "Removed the Claude status line bridge.");
      return;
    }

    default:
      console.error(`Unknown command: ${command}`);
      console.error(helpText());
      process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
