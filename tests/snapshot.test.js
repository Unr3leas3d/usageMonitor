import test from "node:test";
import assert from "node:assert/strict";

import { hasSnapshotSignal, shouldReuseCachedSnapshot, shouldUseCachedSnapshot } from "../src/snapshot.js";

test("hasSnapshotSignal detects agents and usage windows", () => {
  assert.equal(hasSnapshotSignal({ agents: [{ runtime: "codex" }] }), true);
  assert.equal(
    hasSnapshotSignal({
      agents: [],
      aggregateUsage: {
        claude: [{ label: "5h" }],
        codex: []
      }
    }),
    true
  );
  assert.equal(
    hasSnapshotSignal({
      agents: [],
      aggregateUsage: {
        claude: [],
        codex: []
      }
    }),
    false
  );
});

test("shouldReuseCachedSnapshot keeps a recent healthy snapshot over a transient empty refresh", () => {
  const now = Date.parse("2026-03-21T03:20:00.000Z");
  const freshEmptySnapshot = {
    refreshedAt: new Date(now).toISOString(),
    agents: [],
    aggregateUsage: {
      claude: [],
      codex: []
    }
  };
  const cachedSnapshot = {
    refreshedAt: new Date(now - 5_000).toISOString(),
    agents: [{ runtime: "codex" }],
    aggregateUsage: {
      claude: [],
      codex: [{ label: "5h" }]
    }
  };

  assert.equal(shouldReuseCachedSnapshot(freshEmptySnapshot, cachedSnapshot, now), true);
});

test("shouldReuseCachedSnapshot stops reusing stale cached data", () => {
  const now = Date.parse("2026-03-21T03:20:00.000Z");
  const freshEmptySnapshot = {
    refreshedAt: new Date(now).toISOString(),
    agents: [],
    aggregateUsage: {
      claude: [],
      codex: []
    }
  };
  const staleCachedSnapshot = {
    refreshedAt: new Date(now - 20_000).toISOString(),
    agents: [{ runtime: "codex" }],
    aggregateUsage: {
      claude: [],
      codex: [{ label: "5h" }]
    }
  };

  assert.equal(shouldReuseCachedSnapshot(freshEmptySnapshot, staleCachedSnapshot, now), false);
});

test("shouldReuseCachedSnapshot does not replace a populated fresh snapshot", () => {
  const now = Date.parse("2026-03-21T03:20:00.000Z");
  const freshSnapshot = {
    refreshedAt: new Date(now).toISOString(),
    agents: [{ runtime: "claude" }],
    aggregateUsage: {
      claude: [],
      codex: []
    }
  };
  const cachedSnapshot = {
    refreshedAt: new Date(now - 5_000).toISOString(),
    agents: [{ runtime: "codex" }],
    aggregateUsage: {
      claude: [],
      codex: [{ label: "5h" }]
    }
  };

  assert.equal(shouldReuseCachedSnapshot(freshSnapshot, cachedSnapshot, now), false);
});

test("shouldUseCachedSnapshot accepts recent snapshots with signal", () => {
  const now = Date.parse("2026-03-21T03:20:00.000Z");
  const cachedSnapshot = {
    refreshedAt: new Date(now - 2_000).toISOString(),
    agents: [{ runtime: "codex" }],
    aggregateUsage: {
      claude: [],
      codex: []
    }
  };

  assert.equal(shouldUseCachedSnapshot(cachedSnapshot, now, 4_000), true);
});

test("shouldUseCachedSnapshot rejects recent snapshots with no signal", () => {
  const now = Date.parse("2026-03-21T03:20:00.000Z");
  const cachedSnapshot = {
    refreshedAt: new Date(now - 2_000).toISOString(),
    agents: [],
    aggregateUsage: {
      claude: [],
      codex: []
    }
  };

  assert.equal(shouldUseCachedSnapshot(cachedSnapshot, now, 4_000), false);
});
