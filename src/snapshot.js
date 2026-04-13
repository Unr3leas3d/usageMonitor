import { aggregateUsage } from "./inference.js";
import { listProcesses } from "./processes.js";
import { collectClaudeAgents } from "./collectors/claude.js";
import { collectCodexAgents } from "./collectors/codex.js";
import { loadLatestSnapshot, saveLatestSnapshot } from "./cache.js";

const EMPTY_SNAPSHOT_GRACE_MS = 15_000;

function snapshotAgeMs(snapshot, now = Date.now()) {
  if (!snapshot?.refreshedAt) {
    return Number.POSITIVE_INFINITY;
  }

  const refreshedAt = new Date(snapshot.refreshedAt).getTime();
  if (!Number.isFinite(refreshedAt)) {
    return Number.POSITIVE_INFINITY;
  }

  return now - refreshedAt;
}

export function hasSnapshotSignal(snapshot) {
  return Boolean(
    snapshot?.agents?.length ||
      snapshot?.aggregateUsage?.claude?.length ||
      snapshot?.aggregateUsage?.codex?.length
  );
}

export function shouldUseCachedSnapshot(snapshot, now = Date.now(), maxCacheAgeMs = 4_000) {
  return hasSnapshotSignal(snapshot) && snapshotAgeMs(snapshot, now) <= maxCacheAgeMs;
}

export function shouldReuseCachedSnapshot(snapshot, cachedSnapshot, now = Date.now()) {
  if (hasSnapshotSignal(snapshot) || !hasSnapshotSignal(cachedSnapshot)) {
    return false;
  }

  const ageMs = snapshotAgeMs(cachedSnapshot, now);
  return ageMs >= 0 && ageMs <= EMPTY_SNAPSHOT_GRACE_MS;
}

export function buildSnapshot({ now = Date.now(), fallbackSnapshot = null } = {}) {
  const processes = listProcesses();
  const claude = collectClaudeAgents(processes, now);
  const codex = collectCodexAgents(processes);
  const agents = [...claude.agents, ...codex.agents].sort((left, right) => {
    if (left.runtime !== right.runtime) {
      return left.runtime.localeCompare(right.runtime);
    }
    return (right.lastEventAt ?? 0) - (left.lastEventAt ?? 0);
  });

  const snapshot = {
    refreshedAt: new Date(now).toISOString(),
    agents,
    aggregateUsage: {
      claude: claude.accountUsage.length ? claude.accountUsage : aggregateUsage(agents, "claude"),
      codex: aggregateUsage(agents, "codex")
    },
    warnings: [...claude.warnings, ...codex.warnings]
  };

  if (shouldReuseCachedSnapshot(snapshot, fallbackSnapshot, now)) {
    return fallbackSnapshot;
  }

  saveLatestSnapshot(snapshot);
  return snapshot;
}

export function getSnapshot({ preferCache = false, maxCacheAgeMs = 4_000, now = Date.now() } = {}) {
  const cached = loadLatestSnapshot();

  if (preferCache) {
    if (shouldUseCachedSnapshot(cached, now, maxCacheAgeMs)) {
      return cached;
    }
  }

  try {
    return buildSnapshot({
      now,
      fallbackSnapshot: preferCache ? cached : null
    });
  } catch (error) {
    if (preferCache && cached) {
      return cached;
    }

    throw error;
  }
}
