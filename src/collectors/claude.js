import fs from "node:fs";
import path from "node:path";

import { loadIndex, saveIndex, loadJsonFile } from "../cache.js";
import { readLastJsonLines } from "../jsonl.js";
import { getCachePaths, getClaudePaths, encodeClaudeProjectPath, pathExists, findFileRecursive } from "../paths.js";
import { listOpenFiles } from "../processes.js";
import { inferClaudeState, normalizeClaudeUsage, timestampOf } from "../inference.js";
import { compareSemver, parseJson, sortByLatestTimestamp } from "../utils.js";

const CLAUDE_RATE_LIMITS_VERSION = "2.1.80";

function readClaudeStatusSnapshots() {
  const { claudeStatusDir } = getCachePaths();

  if (!pathExists(claudeStatusDir)) {
    return {
      bySession: {},
      ordered: []
    };
  }

  const snapshots = {};
  const ordered = [];
  for (const fileName of fs.readdirSync(claudeStatusDir)) {
    if (!fileName.endsWith(".json")) {
      continue;
    }

    const filePath = path.join(claudeStatusDir, fileName);
    const data = loadJsonFile(filePath, null);
    if (!data) {
      continue;
    }

    const snapshot = {
      ...data,
      __path: filePath,
      __capturedAt: timestampOf(data.captured_at) || fs.statSync(filePath).mtimeMs || 0
    };
    ordered.push(snapshot);

    if (snapshot.session_id) {
      snapshots[snapshot.session_id] = snapshot;
    }
  }

  return {
    bySession: snapshots,
    ordered: sortByLatestTimestamp(ordered, (snapshot) => snapshot.__capturedAt)
  };
}

function projectDirFromSnapshot(snapshot) {
  return snapshot?.workspace?.project_dir || snapshot?.workspace?.current_dir || snapshot?.cwd || null;
}

function selectClaudeUsageSnapshot(sessionId, cwd, statusSnapshots) {
  const direct = sessionId ? statusSnapshots.bySession[sessionId] || null : null;
  const directUsage = direct?.rate_limits ? direct : null;

  if (directUsage) {
    return {
      statusSnapshot: direct,
      usageSnapshot: directUsage,
      usageSource: "session"
    };
  }

  const projectMatch =
    cwd == null
      ? null
      : statusSnapshots.ordered.find((snapshot) => snapshot.rate_limits && projectDirFromSnapshot(snapshot) === cwd) || null;

  if (projectMatch) {
    return {
      statusSnapshot: direct,
      usageSnapshot: projectMatch,
      usageSource: "project"
    };
  }

  const latestUsage = statusSnapshots.ordered.find((snapshot) => snapshot.rate_limits) || null;
  return {
    statusSnapshot: direct,
    usageSnapshot: latestUsage,
    usageSource: latestUsage ? "global" : null
  };
}

export function describeClaudeBridgeIssue(statusSnapshots) {
  if (!statusSnapshots.ordered.length || statusSnapshots.ordered.some((snapshot) => snapshot.rate_limits)) {
    return null;
  }

  const newest = statusSnapshots.ordered[0];
  if (newest?.version && compareSemver(newest.version, CLAUDE_RATE_LIMITS_VERSION) < 0) {
    return `Claude bridge is active, but Claude ${newest.version} does not emit rate limits. Upgrade Claude Code to ${CLAUDE_RATE_LIMITS_VERSION}+ to populate 5h/7d usage.`;
  }

  return "Claude bridge is active, but no rate-limit data has been captured yet. Trigger a Claude status-line refresh in an active session.";
}

function resolveClaudeTranscriptPath(sessionId, cwd, statusSnapshot, transcriptIndex) {
  const { projectsDir } = getClaudePaths();
  const { claudeTranscriptIndexPath } = getCachePaths();

  if (statusSnapshot?.transcript_path && pathExists(statusSnapshot.transcript_path)) {
    transcriptIndex[sessionId] = statusSnapshot.transcript_path;
    saveIndex(claudeTranscriptIndexPath, transcriptIndex);
    return statusSnapshot.transcript_path;
  }

  if (transcriptIndex[sessionId] && pathExists(transcriptIndex[sessionId])) {
    return transcriptIndex[sessionId];
  }

  const candidateProjectDir = cwd ? path.join(projectsDir, encodeClaudeProjectPath(cwd)) : null;
  const candidatePath = candidateProjectDir ? path.join(candidateProjectDir, `${sessionId}.jsonl`) : null;
  if (candidatePath && pathExists(candidatePath)) {
    transcriptIndex[sessionId] = candidatePath;
    saveIndex(claudeTranscriptIndexPath, transcriptIndex);
    return candidatePath;
  }

  const foundPath = findFileRecursive(projectsDir, (fullPath, fileName) => fileName === `${sessionId}.jsonl`);
  if (foundPath) {
    transcriptIndex[sessionId] = foundPath;
    saveIndex(claudeTranscriptIndexPath, transcriptIndex);
    return foundPath;
  }

  return null;
}

function summarizeTaskDirectory(taskDir) {
  if (!taskDir || !pathExists(taskDir)) {
    return null;
  }

  const tasks = [];
  for (const fileName of fs.readdirSync(taskDir)) {
    if (!fileName.endsWith(".json")) {
      continue;
    }

    const filePath = path.join(taskDir, fileName);
    const task = loadJsonFile(filePath, null);
    if (!task) {
      continue;
    }

    const stat = fs.statSync(filePath);
    tasks.push({
      ...task,
      mtimeMs: stat.mtimeMs
    });
  }

  const pendingTasks = tasks.filter((task) => task.status === "pending");
  const recentPending = sortByLatestTimestamp(pendingTasks, (task) => task.mtimeMs)[0];

  if (!recentPending) {
    return null;
  }

  return recentPending.activeForm || recentPending.subject || recentPending.description || null;
}

function scanClaudeDebugMatches(process) {
  const { debugDir } = getClaudePaths();

  if (!pathExists(debugDir)) {
    return [];
  }

  const names = fs.readdirSync(debugDir).filter((name) => name !== "latest");
  if (names.length === 0) {
    return [];
  }

  try {
    return listOpenFiles(process.pid).filter((filePath) => filePath.startsWith(debugDir));
  } catch {
    return [];
  }
}

function extractClaudeActivity(transcriptPath, taskSummary) {
  if (!transcriptPath || !pathExists(transcriptPath)) {
    return {
      lastEventAt: null,
      lastSignalAt: null,
      hasThinkingSignal: false,
      hasTextSignal: false,
      lastText: null,
      tool: null,
      taskSummary
    };
  }

  const entries = readLastJsonLines(transcriptPath, { maxBytes: 384 * 1024, maxLines: 250 });
  let lastEventAt = null;
  let lastSignalAt = null;
  let tool = null;
  let hasThinkingSignal = false;
  let hasTextSignal = false;
  let lastText = null;

  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    const entryTimestamp =
      timestampOf(entry.timestamp) ||
      timestampOf(entry.data?.message?.timestamp) ||
      timestampOf(entry.message?.timestamp);

    if (!lastEventAt && entryTimestamp) {
      lastEventAt = entryTimestamp;
    }

    const message =
      entry.type === "assistant"
        ? entry.message
        : entry.type === "progress" && entry.data?.message?.type === "assistant"
          ? entry.data.message.message
          : null;

    if (!message) {
      continue;
    }

    const content = Array.isArray(message.content) ? message.content : [];
    const toolUse = content.find((item) => item?.type === "tool_use");
    if (!tool && toolUse) {
      tool = { name: toolUse.name, input: toolUse.input };
      lastSignalAt = entryTimestamp || lastSignalAt;
      continue;
    }

    if (!hasThinkingSignal && content.some((item) => item?.type === "thinking")) {
      hasThinkingSignal = true;
      lastSignalAt = lastSignalAt || entryTimestamp;
    }

    const textItem = content.find((item) => item?.type === "text" && item.text);
    if (!hasTextSignal && textItem) {
      hasTextSignal = true;
      lastText = textItem.text;
      lastSignalAt = lastSignalAt || entryTimestamp;
    }
  }

  return {
    lastEventAt,
    lastSignalAt,
    hasThinkingSignal,
    hasTextSignal,
    lastText,
    tool,
    taskSummary
  };
}

export function collectClaudeAgents(processes, now = Date.now()) {
  const { sessionsDir } = getClaudePaths();
  const { claudeTranscriptIndexPath } = getCachePaths();
  const statusSnapshots = readClaudeStatusSnapshots();
  const transcriptIndex = loadIndex(claudeTranscriptIndexPath);
  const warnings = [];
  const agents = [];
  const bridgeIssue = describeClaudeBridgeIssue(statusSnapshots);

  if (bridgeIssue) {
    warnings.push(bridgeIssue);
  }

  for (const process of processes.filter((item) => /(^|\/)claude(\s|$)/.test(item.command))) {
    const sessionFile = path.join(sessionsDir, `${process.pid}.json`);
    if (!pathExists(sessionFile)) {
      warnings.push(`Claude pid ${process.pid} has no session file at ${sessionFile}`);
      continue;
    }

    const sessionData = loadJsonFile(sessionFile, null);
    if (!sessionData?.sessionId) {
      warnings.push(`Claude pid ${process.pid} session file is unreadable`);
      continue;
    }

    const statusSelection = selectClaudeUsageSnapshot(sessionData.sessionId, sessionData.cwd, statusSnapshots);
    const statusSnapshot = statusSelection.statusSnapshot;
    const usageSnapshot = statusSelection.usageSnapshot;
    const transcriptPath = resolveClaudeTranscriptPath(
      sessionData.sessionId,
      sessionData.cwd,
      statusSnapshot || usageSnapshot,
      transcriptIndex
    );
    const taskDir = path.join(getClaudePaths().tasksDir, sessionData.sessionId);
    const taskSummary = summarizeTaskDirectory(taskDir);
    const activity = extractClaudeActivity(transcriptPath, taskSummary);
    const inferred = inferClaudeState(activity);

    agents.push({
      runtime: "claude",
      pid: process.pid,
      tty: process.tty,
      sessionId: sessionData.sessionId,
      projectDir: path.basename(sessionData.cwd || process.command),
      cwd: sessionData.cwd,
      startedAt: new Date(sessionData.startedAt || Date.now()).toISOString(),
      elapsedMs: process.elapsedMs,
      state: inferred.state,
      currentTool: inferred.currentTool,
      lastEventAt: activity.lastEventAt,
      lastSummary: inferred.summary,
      usage: normalizeClaudeUsage(usageSnapshot, now),
      detailSourcePaths: {
        sessionFile,
        transcriptPath,
        taskDir: pathExists(taskDir) ? taskDir : null,
        statusSnapshotPath: statusSnapshot?.__path || null,
        usageSnapshotPath: usageSnapshot?.__path || null,
        usageSnapshotScope: statusSelection.usageSource,
        debugMatches: scanClaudeDebugMatches(process)
      }
    });
  }

  const latestUsageSnapshot = statusSnapshots.ordered.find((snapshot) => snapshot.rate_limits) || null;
  const accountUsage = normalizeClaudeUsage(latestUsageSnapshot, now);

  return { agents, warnings, accountUsage };
}
