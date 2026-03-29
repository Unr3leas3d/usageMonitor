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
      `set -g mouse on\n${TMUX_BLOCK_START}\nset -g status-right '#(vibe-meter tmux-status)'\n${TMUX_BLOCK_END}\n`
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
      `${TMUX_BLOCK_START}\nset -g status-right '#(vibe-meter tmux-status)'\n${TMUX_BLOCK_END}\n`
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
    assert.ok(content.includes("vibe-meter tmux-status"));
    assert.ok(content.includes(TMUX_BLOCK_END));
    assert.ok(content.startsWith("set -g mouse on\n"));
  });

  it("creates new file with block when file does not exist", () => {
    const confPath = path.join(tmpDir, ".tmux.conf");
    appendTmuxBlock(confPath);
    const content = fs.readFileSync(confPath, "utf8");
    assert.ok(content.includes(TMUX_BLOCK_START));
    assert.ok(content.includes("vibe-meter tmux-status"));
  });
});

describe("removeTmuxBlock", () => {
  it("removes the marker block and preserves surrounding content", () => {
    const confPath = path.join(tmpDir, ".tmux.conf");
    fs.writeFileSync(
      confPath,
      `set -g mouse on\n${TMUX_BLOCK_START}\nset -g status-right '#(vibe-meter tmux-status)'\nset -g status-interval 2\n${TMUX_BLOCK_END}\nset -g base-index 1\n`
    );
    const removed = removeTmuxBlock(confPath);
    assert.equal(removed, true);
    const content = fs.readFileSync(confPath, "utf8");
    assert.ok(!content.includes(TMUX_BLOCK_START));
    assert.ok(!content.includes("vibe-meter"));
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
