import { formatUsageWindowLabel, safeDate } from "./utils.js";

const READ_ONLY_COMMAND = /^(rg|grep|cat|sed|head|tail|find|ls|ps|lsof|jq|sqlite3|readlink|which|git\s+(status|show|diff|log)|wc)\b/i;
const SLEEP_COMMAND = /^(sleep|watch)\b/i;

function normalizeToolName(value) {
  if (!value) {
    return null;
  }

  return String(value);
}

function classifyCommandState(command) {
  if (!command) {
    return { state: "thinking", tool: "exec_command", detail: null };
  }

  if (SLEEP_COMMAND.test(command)) {
    return { state: "sleeping", tool: "exec_command", detail: command };
  }

  if (READ_ONLY_COMMAND.test(command.trim())) {
    return { state: "reading", tool: "exec_command", detail: command };
  }

  return { state: "thinking", tool: "exec_command", detail: command };
}

export function inferClaudeState(activity, now = Date.now()) {
  const signalAgeMs = activity.lastSignalAt ? now - activity.lastSignalAt : Number.POSITIVE_INFINITY;
  const idleAgeMs = activity.lastEventAt ? now - activity.lastEventAt : Number.POSITIVE_INFINITY;

  if (activity.tool) {
    const toolName = normalizeToolName(activity.tool.name);
    const toolInput = activity.tool.input || {};

    if (toolName === "Read" || toolName === "Glob" || toolName === "Grep" || toolName === "LS") {
      return { state: "reading", currentTool: toolName, summary: toolInput.file_path || toolInput.pattern || null };
    }

    if (toolName === "Edit" || toolName === "MultiEdit" || toolName === "Write") {
      return { state: "typing", currentTool: toolName, summary: toolInput.file_path || null };
    }

    if (toolName === "Agent") {
      return { state: "thinking", currentTool: toolName, summary: toolInput.description || null };
    }

    if (toolName === "Bash") {
      const command = toolInput.command || toolInput.cmd || "";
      const classification = classifyCommandState(command);
      return {
        state: classification.state,
        currentTool: toolName,
        summary: classification.detail
      };
    }

    return { state: "thinking", currentTool: toolName, summary: null };
  }

  if (signalAgeMs <= 45_000 && activity.hasThinkingSignal) {
    return { state: "thinking", currentTool: null, summary: activity.taskSummary };
  }

  if (signalAgeMs <= 15_000 && activity.hasTextSignal) {
    return { state: "typing", currentTool: null, summary: activity.lastText };
  }

  if (activity.taskSummary && signalAgeMs <= 120_000) {
    const summary = activity.taskSummary.toLowerCase();
    if (/explor|review|read/.test(summary)) {
      return { state: "reading", currentTool: null, summary: activity.taskSummary };
    }
    return { state: "thinking", currentTool: null, summary: activity.taskSummary };
  }

  if (idleAgeMs > 15 * 60_000) {
    return { state: "idle", currentTool: null, summary: null };
  }

  return { state: "waiting_for_input", currentTool: null, summary: null };
}

export function inferCodexState(activity, now = Date.now()) {
  const signalAgeMs = activity.lastSignalAt ? now - activity.lastSignalAt : Number.POSITIVE_INFINITY;
  const idleAgeMs = activity.lastEventAt ? now - activity.lastEventAt : Number.POSITIVE_INFINITY;

  if (activity.functionCall) {
    const name = normalizeToolName(activity.functionCall.name);

    if (name === "exec_command") {
      const classification = classifyCommandState(activity.functionCall.command || "");
      return {
        state: classification.state,
        currentTool: name,
        summary: classification.detail
      };
    }

    if (name === "apply_patch") {
      return { state: "typing", currentTool: name, summary: null };
    }

    if (name === "write_stdin") {
      const hasInput = Boolean(activity.functionCall.chars);
      return {
        state: hasInput ? "typing" : "waiting_for_input",
        currentTool: name,
        summary: hasInput ? "interacting with subprocess" : "polling subprocess"
      };
    }

    if (
      name === "open" ||
      name === "click" ||
      name === "find" ||
      name === "search_query" ||
      name === "image_query" ||
      name === "finance" ||
      name === "weather" ||
      name === "sports" ||
      name === "time"
    ) {
      return { state: "reading", currentTool: name, summary: null };
    }

    return { state: "thinking", currentTool: name, summary: null };
  }

  if (signalAgeMs <= 45_000 && activity.hasReasoningSignal) {
    return { state: "thinking", currentTool: null, summary: null };
  }

  if (signalAgeMs <= 15_000 && activity.hasMessageSignal) {
    return { state: "typing", currentTool: null, summary: activity.lastMessage };
  }

  if (idleAgeMs > 15 * 60_000) {
    return { state: "idle", currentTool: null, summary: null };
  }

  return { state: "waiting_for_input", currentTool: null, summary: null };
}

function normalizeResetTs(resetsAt) {
  if (!resetsAt) {
    return NaN;
  }
  return typeof resetsAt === "number"
    ? (resetsAt < 1e12 ? resetsAt * 1000 : resetsAt)
    : new Date(resetsAt).getTime();
}

function windowExpired(resetsAt, now) {
  if (!resetsAt) {
    return false;
  }

  const ts = normalizeResetTs(resetsAt);
  return Number.isFinite(ts) && now > ts;
}

/**
 * If resetsAt is in the past, roll it forward by windowMinutes increments
 * until it's in the future. Returns epoch-seconds (matching Codex/Claude format)
 * or the original resetsAt if no rolling is needed.
 */
function rollForwardReset(resetsAt, windowMinutes, now) {
  if (!resetsAt || !windowMinutes) {
    return resetsAt;
  }

  const tsMs = normalizeResetTs(resetsAt);
  if (!Number.isFinite(tsMs) || tsMs > now) {
    return resetsAt;
  }

  const windowMs = windowMinutes * 60_000;
  const elapsed = now - tsMs;
  const periods = Math.ceil(elapsed / windowMs);
  const nextTsMs = tsMs + periods * windowMs;

  // Return in the same unit as input (seconds if < 1e12, else ms)
  return typeof resetsAt === "number" && resetsAt < 1e12
    ? Math.round(nextTsMs / 1000)
    : nextTsMs;
}

export function normalizeClaudeUsage(bridgeSnapshot, now = Date.now()) {
  if (!bridgeSnapshot?.rate_limits) {
    return [];
  }

  return [
    bridgeSnapshot.rate_limits.five_hour
      ? {
          label: "5h",
          usedPct: windowExpired(bridgeSnapshot.rate_limits.five_hour.resets_at, now)
            ? null
            : bridgeSnapshot.rate_limits.five_hour.used_percentage ?? null,
          resetsAt: rollForwardReset(bridgeSnapshot.rate_limits.five_hour.resets_at, 300, now) ?? null,
          windowMinutes: 300,
          source: "claude-statusline"
        }
      : null,
    bridgeSnapshot.rate_limits.seven_day
      ? {
          label: "7d",
          usedPct: windowExpired(bridgeSnapshot.rate_limits.seven_day.resets_at, now)
            ? null
            : bridgeSnapshot.rate_limits.seven_day.used_percentage ?? null,
          resetsAt: rollForwardReset(bridgeSnapshot.rate_limits.seven_day.resets_at, 10080, now) ?? null,
          windowMinutes: 10080,
          source: "claude-statusline"
        }
      : null
  ].filter(Boolean);
}

export function normalizeCodexUsage(rateLimits, now = Date.now()) {
  if (!rateLimits) {
    return [];
  }

  return [rateLimits.primary, rateLimits.secondary]
    .filter(Boolean)
    .map((window) => ({
      label: formatUsageWindowLabel(window.window_minutes),
      usedPct: window.used_percent ?? null,
      resetsAt: rollForwardReset(window.resets_at, window.window_minutes, now) ?? null,
      windowMinutes: window.window_minutes ?? null,
      source: "codex-transcript"
    }));
}

export function aggregateUsage(agents, runtime) {
  const aggregated = new Map();

  for (const agent of agents.filter((item) => item.runtime === runtime)) {
    for (const window of agent.usage || []) {
      const existing = aggregated.get(window.label);
      if (!existing || (agent.lastEventAt ?? 0) > (existing.lastEventAt ?? 0)) {
        aggregated.set(window.label, { ...window, lastEventAt: agent.lastEventAt ?? 0 });
      }
    }
  }

  return [...aggregated.values()]
    .sort((left, right) => (left.windowMinutes ?? 0) - (right.windowMinutes ?? 0))
    .map(({ lastEventAt, ...rest }) => rest);
}

export function summarizeSourceHealth(paths) {
  const values = Object.values(paths).flat().filter(Boolean);
  return `${values.length} sources`;
}

export function timestampOf(value) {
  if (!value) {
    return null;
  }

  if (typeof value === "number") {
    return value;
  }

  const date = safeDate(value);
  return date ? date.getTime() : null;
}
