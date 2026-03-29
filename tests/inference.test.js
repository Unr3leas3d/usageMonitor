import test from "node:test";
import assert from "node:assert/strict";

import { inferClaudeState, inferCodexState, normalizeClaudeUsage, normalizeCodexUsage } from "../src/inference.js";

test("Claude Read tool maps to reading", () => {
  const state = inferClaudeState({
    tool: { name: "Read", input: { file_path: "/tmp/file.ts" } },
    lastSignalAt: Date.now(),
    lastEventAt: Date.now()
  });

  assert.equal(state.state, "reading");
  assert.equal(state.currentTool, "Read");
});

test("Codex write_stdin without chars maps to waiting_for_input", () => {
  const state = inferCodexState({
    functionCall: { name: "write_stdin", chars: "" },
    lastSignalAt: Date.now(),
    lastEventAt: Date.now()
  });

  assert.equal(state.state, "waiting_for_input");
  assert.equal(state.currentTool, "write_stdin");
});

test("Claude idle fallback triggers after long silence", () => {
  const state = inferClaudeState({
    lastSignalAt: null,
    lastEventAt: Date.now() - 20 * 60_000,
    hasThinkingSignal: false,
    hasTextSignal: false,
    taskSummary: null
  });

  assert.equal(state.state, "idle");
});

test("normalize usage windows", () => {
  const now = Date.parse("2026-03-23T12:00:00.000Z");
  const futureReset = "2026-03-23T17:00:00.000Z";
  const claudeUsage = normalizeClaudeUsage({
    rate_limits: {
      five_hour: { used_percentage: 12.2, resets_at: futureReset },
      seven_day: { used_percentage: 44.4, resets_at: futureReset }
    }
  }, now);
  const codexUsage = normalizeCodexUsage({
    primary: { used_percent: 3, resets_at: futureReset, window_minutes: 300 },
    secondary: { used_percent: 9, resets_at: futureReset, window_minutes: 10080 }
  });

  assert.deepEqual(
    claudeUsage.map((item) => item.label),
    ["5h", "7d"]
  );
  assert.equal(claudeUsage[0].usedPct, 12.2);
  assert.equal(claudeUsage[1].usedPct, 44.4);
  assert.deepEqual(
    codexUsage.map((item) => item.label),
    ["5h", "7d"]
  );
});

test("normalizeClaudeUsage nulls usedPct when resets_at is in the past", () => {
  const now = Date.parse("2026-03-23T12:00:00.000Z");
  const usage = normalizeClaudeUsage({
    rate_limits: {
      five_hour: { used_percentage: 80, resets_at: "2026-03-23T11:00:00.000Z" },
      seven_day: { used_percentage: 50, resets_at: "2026-03-30T12:00:00.000Z" }
    }
  }, now);

  assert.equal(usage[0].label, "5h");
  assert.equal(usage[0].usedPct, null, "expired 5h window should have null usedPct");
  assert.equal(usage[1].label, "7d");
  assert.equal(usage[1].usedPct, 50, "non-expired 7d window should keep usedPct");
});

test("normalizeClaudeUsage keeps usedPct when resets_at is missing", () => {
  const now = Date.parse("2026-03-23T12:00:00.000Z");
  const usage = normalizeClaudeUsage({
    rate_limits: {
      five_hour: { used_percentage: 25 }
    }
  }, now);

  assert.equal(usage[0].usedPct, 25);
});

test("normalizeClaudeUsage handles resets_at as unix seconds", () => {
  const now = Date.parse("2026-03-23T12:00:00.000Z");
  const futureUnixSeconds = Math.floor(Date.parse("2026-03-23T17:00:00.000Z") / 1000);
  const pastUnixSeconds = Math.floor(Date.parse("2026-03-23T11:00:00.000Z") / 1000);

  const usage = normalizeClaudeUsage({
    rate_limits: {
      five_hour: { used_percentage: 80, resets_at: pastUnixSeconds },
      seven_day: { used_percentage: 50, resets_at: futureUnixSeconds }
    }
  }, now);

  assert.equal(usage[0].usedPct, null, "expired unix-seconds window should have null usedPct");
  assert.equal(usage[1].usedPct, 50, "non-expired unix-seconds window should keep usedPct");
});
