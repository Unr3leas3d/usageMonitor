import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";

import { pathExists } from "./paths.js";

export const TMUX_BLOCK_START = "# vibe-meter (auto-installed)";
export const TMUX_BLOCK_END = "# /vibe-meter";

const TMUX_BLOCK_BODY = [
  "set -g status-right '#(vibe-meter tmux-status)'",
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
