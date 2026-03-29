import process from "node:process";

import { getSnapshot } from "./snapshot.js";
import { formatDuration, formatResetCountdown, formatResetTimestamp, pad, truncate } from "./utils.js";

const ANSI = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  magenta: "\x1b[35m",
  blue: "\x1b[34m"
};

function color(text, code) {
  return `${code}${text}${ANSI.reset}`;
}

function stateColor(state) {
  switch (state) {
    case "typing":
      return ANSI.green;
    case "reading":
      return ANSI.cyan;
    case "thinking":
      return ANSI.magenta;
    case "sleeping":
      return ANSI.blue;
    case "waiting_for_input":
      return ANSI.yellow;
    case "idle":
      return ANSI.dim;
    default:
      return ANSI.reset;
  }
}

function formatUsageWindows(windows) {
  if (!windows?.length) {
    return "n/a";
  }

  return windows.map((window) => {
    const pct = window.usedPct != null ? Math.round(window.usedPct) + "%" : "-%";
    if (window.usedPct != null && window.usedPct >= 100) {
      const countdown = formatResetCountdown(window.resetsAt);
      if (countdown) {
        return `${window.label} ${pct} (${countdown})`;
      }
    }
    return `${window.label} ${pct}`;
  }).join(" ");
}

function renderRuntimeSummary(label, windows) {
  return `${label} ${formatUsageWindows(windows)}`;
}

function buildTable(snapshot, selectedIndex, columns) {
  const header = [
    pad("RT", columns.runtime),
    pad("PID", columns.pid, "right"),
    pad("Session", columns.session),
    pad("Project", columns.project),
    pad("State", columns.state),
    pad("Tool", columns.tool),
    pad("Elapsed", columns.elapsed),
    pad("Usage", columns.usage)
  ].join(" ");

  const lines = [color(header, ANSI.bold)];

  for (let index = 0; index < snapshot.agents.length; index += 1) {
    const agent = snapshot.agents[index];
    const marker = index === selectedIndex ? color(">", ANSI.bold) : " ";
    const state = color(pad(agent.state, columns.state), stateColor(agent.state));
    const runtime = color(
      pad(agent.runtime, columns.runtime),
      agent.runtime === "claude" ? ANSI.cyan : ANSI.green
    );
    const line = [
      marker,
      runtime,
      pad(agent.pid, columns.pid, "right"),
      pad(agent.sessionId, columns.session),
      pad(agent.projectDir, columns.project),
      state,
      pad(agent.currentTool || "—", columns.tool),
      pad(formatDuration(agent.elapsedMs), columns.elapsed),
      pad(formatUsageWindows(agent.usage), columns.usage)
    ].join(" ");
    lines.push(line);
  }

  if (snapshot.agents.length === 0) {
    lines.push(color("No live Claude or Codex sessions detected.", ANSI.dim));
  }

  return lines;
}

function buildDetails(snapshot, selectedIndex, showRaw, width) {
  const agent = snapshot.agents[selectedIndex];
  if (!agent) {
    return [color("No selection", ANSI.dim)];
  }

  const lines = [
    color(`Selected ${agent.runtime} ${agent.sessionId}`, ANSI.bold),
    `cwd: ${truncate(agent.cwd || "n/a", width)}`,
    `state: ${agent.state}${agent.currentTool ? ` | tool: ${agent.currentTool}` : ""}`,
    `elapsed: ${formatDuration(agent.elapsedMs)} | last event: ${agent.lastEventAt ? new Date(agent.lastEventAt).toLocaleString() : "n/a"}`,
    `usage: ${agent.usage.map((window) => {
      const pct = window.usedPct != null ? Math.round(window.usedPct) + "%" : "-%";
      const resetTs = formatResetTimestamp(window.resetsAt);
      if (window.usedPct != null && window.usedPct >= 100) {
        const countdown = formatResetCountdown(window.resetsAt);
        return countdown
          ? `${window.label} ${pct} resets ${countdown} (${resetTs})`
          : `${window.label} ${pct} reset ${resetTs}`;
      }
      return `${window.label} ${pct} reset ${resetTs}`;
    }).join(" | ") || "n/a"}`
  ];

  if (agent.lastSummary) {
    lines.push(`summary: ${truncate(agent.lastSummary, width)}`);
  }

  if (showRaw) {
    for (const [key, value] of Object.entries(agent.detailSourcePaths || {})) {
      if (!value || (Array.isArray(value) && value.length === 0)) {
        continue;
      }

      const rendered = Array.isArray(value) ? value.join(" | ") : String(value);
      lines.push(`${key}: ${truncate(rendered, width)}`);
    }
  } else {
    const compactSources = Object.entries(agent.detailSourcePaths || {})
      .filter(([, value]) => Boolean(value) && (!Array.isArray(value) || value.length > 0))
      .map(([key]) => key)
      .join(", ");
    lines.push(`sources: ${compactSources || "n/a"}`);
  }

  return lines;
}

function renderFrame(snapshot, selectedIndex, showRaw) {
  const width = process.stdout.columns || 120;
  const tableColumns = {
    runtime: 6,
    pid: 6,
    session: 20,
    project: 18,
    state: 16,
    tool: 14,
    elapsed: 9,
    usage: Math.max(14, width - 111)
  };

  const lines = [
    "\x1b[2J\x1b[H",
    color("vibe-meter", ANSI.bold),
    `${renderRuntimeSummary("Claude", snapshot.aggregateUsage.claude)} | ${renderRuntimeSummary("Codex", snapshot.aggregateUsage.codex)} | active ${snapshot.agents.length} | refreshed ${new Date(snapshot.refreshedAt).toLocaleTimeString()}`,
    color("Keys: q quit | j/k or arrows move | r refresh | o toggle raw sources", ANSI.dim),
    ""
  ];

  lines.push(...buildTable(snapshot, selectedIndex, tableColumns));
  lines.push("");
  lines.push(...buildDetails(snapshot, selectedIndex, showRaw, width - 10));

  if (snapshot.warnings.length > 0) {
    lines.push("");
    lines.push(color(`Warnings: ${snapshot.warnings[0]}`, ANSI.yellow));
    if (snapshot.warnings.length > 1) {
      lines.push(color(`+${snapshot.warnings.length - 1} more`, ANSI.dim));
    }
  }

  process.stdout.write(lines.join("\n"));
}

export async function runTui() {
  let selectedIndex = 0;
  let showRaw = false;
  let snapshot = { refreshedAt: new Date().toISOString(), agents: [], aggregateUsage: { claude: [], codex: [] }, warnings: [] };
  let refreshing = false;
  let intervalId = null;

  const cleanup = () => {
    if (intervalId) {
      clearInterval(intervalId);
    }

    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }

    process.stdin.pause();
    process.stdout.write("\x1b[?25h\x1b[?1049l");
  };

  const refresh = () => {
    if (refreshing) {
      return;
    }

    refreshing = true;
    try {
      snapshot = getSnapshot();
      if (selectedIndex >= snapshot.agents.length) {
        selectedIndex = Math.max(0, snapshot.agents.length - 1);
      }
      renderFrame(snapshot, selectedIndex, showRaw);
    } catch (error) {
      snapshot = {
        ...snapshot,
        refreshedAt: new Date().toISOString(),
        warnings: [error.message]
      };
      renderFrame(snapshot, selectedIndex, showRaw);
    } finally {
      refreshing = false;
    }
  };

  const onKey = (buffer) => {
    const key = buffer.toString("utf8");

    if (key === "q" || key === "\u0003") {
      cleanup();
      process.exit(0);
    }

    if (key === "j" || key === "\x1b[B") {
      selectedIndex =
        snapshot.agents.length > 0
          ? Math.min(snapshot.agents.length - 1, selectedIndex + 1)
          : 0;
      renderFrame(snapshot, selectedIndex, showRaw);
      return;
    }

    if (key === "k" || key === "\x1b[A") {
      selectedIndex = Math.max(0, selectedIndex - 1);
      renderFrame(snapshot, selectedIndex, showRaw);
      return;
    }

    if (key === "o") {
      showRaw = !showRaw;
      renderFrame(snapshot, selectedIndex, showRaw);
      return;
    }

    if (key === "r") {
      refresh();
    }
  };

  process.stdout.write("\x1b[?1049h\x1b[?25l");

  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }
  process.stdin.resume();
  process.stdin.on("data", onKey);
  process.stdout.on("resize", () => renderFrame(snapshot, selectedIndex, showRaw));
  process.on("SIGINT", () => {
    cleanup();
    process.exit(0);
  });

  refresh();
  intervalId = setInterval(refresh, 1000);
}
