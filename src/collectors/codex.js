import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

import { loadIndex, saveIndex } from "../cache.js";
import { readFirstJsonLine, readLastJsonLines } from "../jsonl.js";
import { getCachePaths, getCodexPaths, pathExists, findFileRecursive } from "../paths.js";
import { listOpenFiles } from "../processes.js";
import { inferCodexState, normalizeCodexUsage, timestampOf } from "../inference.js";
import { formatUsageWindowLabel, parseJson } from "../utils.js";

function querySqlite(databasePath, query) {
  return execFileSync(
    "sqlite3",
    ["-readonly", "-separator", "\t", databasePath, query],
    {
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"]
    }
  );
}

function extractPidFromProcessUuid(processUuid) {
  const match = processUuid?.match(/^pid:(\d+):/);
  return match ? Number.parseInt(match[1], 10) : null;
}

function loadLiveCodexThreads() {
  const { logsDbPath } = getCodexPaths();
  if (!pathExists(logsDbPath)) {
    return [];
  }

  const rows = querySqlite(
    logsDbPath,
    `
      WITH ranked AS (
        SELECT
          process_uuid,
          thread_id,
          ts,
          ROW_NUMBER() OVER (
            PARTITION BY process_uuid
            ORDER BY ts DESC, ts_nanos DESC, id DESC
          ) AS rn
        FROM logs
        WHERE process_uuid IS NOT NULL AND thread_id IS NOT NULL
      )
      SELECT process_uuid, thread_id, ts
      FROM ranked
      WHERE rn = 1
      ORDER BY ts DESC;
    `
  );

  return rows
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [processUuid, threadId, ts] = line.split("\t");
      return {
        processUuid,
        pid: extractPidFromProcessUuid(processUuid),
        threadId,
        ts: Number.parseInt(ts, 10) * 1000
      };
    })
    .filter((row) => row.pid && row.threadId);
}

function resolveCodexTranscriptPath(threadId, transcriptIndex) {
  const { sessionsDir } = getCodexPaths();
  const { codexTranscriptIndexPath } = getCachePaths();

  if (transcriptIndex[threadId] && pathExists(transcriptIndex[threadId])) {
    return transcriptIndex[threadId];
  }

  const foundPath = findFileRecursive(
    sessionsDir,
    (fullPath, fileName) => fileName.endsWith(".jsonl") && fileName.includes(threadId)
  );

  if (foundPath) {
    transcriptIndex[threadId] = foundPath;
    saveIndex(codexTranscriptIndexPath, transcriptIndex);
    return foundPath;
  }

  return null;
}

function parseFunctionCallPayload(payload) {
  if (!payload?.arguments) {
    return { name: payload?.name || null };
  }

  const args = parseJson(payload.arguments, {});
  return {
    name: payload.name,
    command: args.cmd || null,
    chars: args.chars || null
  };
}

function extractCodexActivity(transcriptPath) {
  if (!transcriptPath || !pathExists(transcriptPath)) {
    return {
      lastEventAt: null,
      lastSignalAt: null,
      functionCall: null,
      hasReasoningSignal: false,
      hasMessageSignal: false,
      lastMessage: null,
      rateLimits: null
    };
  }

  const entries = readLastJsonLines(transcriptPath, { maxBytes: 512 * 1024, maxLines: 300 });
  let lastEventAt = null;
  let lastSignalAt = null;
  let functionCall = null;
  let hasReasoningSignal = false;
  let hasMessageSignal = false;
  let lastMessage = null;
  let rateLimits = null;

  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    const entryTimestamp = timestampOf(entry.timestamp);

    if (!lastEventAt && entryTimestamp) {
      lastEventAt = entryTimestamp;
    }

    if (!rateLimits && entry.type === "event_msg" && entry.payload?.type === "token_count") {
      rateLimits = entry.payload.rate_limits || null;
    }

    if (!functionCall && entry.type === "response_item" && entry.payload?.type === "function_call") {
      functionCall = parseFunctionCallPayload(entry.payload);
      lastSignalAt = entryTimestamp || lastSignalAt;
      continue;
    }

    if (!hasReasoningSignal && entry.type === "response_item" && entry.payload?.type === "reasoning") {
      hasReasoningSignal = true;
      lastSignalAt = lastSignalAt || entryTimestamp;
    }

    if (
      !hasMessageSignal &&
      (
        (entry.type === "event_msg" && entry.payload?.type === "agent_message") ||
        (entry.type === "response_item" &&
          entry.payload?.type === "message" &&
          Array.isArray(entry.payload.content))
      )
    ) {
      hasMessageSignal = true;
      lastMessage =
        entry.payload?.message ||
        entry.payload?.content?.find((item) => item?.type === "output_text")?.text ||
        null;
      lastSignalAt = lastSignalAt || entryTimestamp;
    }
  }

  return {
    lastEventAt,
    lastSignalAt,
    functionCall,
    hasReasoningSignal,
    hasMessageSignal,
    lastMessage,
    rateLimits
  };
}

function scanCodexOpenArtifacts(pid) {
  try {
    return listOpenFiles(pid).filter(
      (filePath) => filePath.includes(`${path.sep}.codex${path.sep}log`) || filePath.includes(`${path.sep}.codex${path.sep}sessions`)
    );
  } catch {
    return [];
  }
}

export function collectCodexAgents(processes) {
  const { codexTranscriptIndexPath } = getCachePaths();
  const transcriptIndex = loadIndex(codexTranscriptIndexPath);
  const liveThreads = loadLiveCodexThreads();
  const warnings = [];
  const processMap = new Map(processes.map((process) => [process.pid, process]));
  const agents = [];

  for (const liveThread of liveThreads) {
    const process = processMap.get(liveThread.pid);
    if (!process) {
      continue;
    }

    const transcriptPath = resolveCodexTranscriptPath(liveThread.threadId, transcriptIndex);
    const sessionMeta = transcriptPath ? readFirstJsonLine(transcriptPath) : null;
    const activity = extractCodexActivity(transcriptPath);
    const inferred = inferCodexState(activity);

    if (!transcriptPath) {
      warnings.push(`Codex pid ${liveThread.pid} thread ${liveThread.threadId} has no transcript path`);
    }

    agents.push({
      runtime: "codex",
      pid: liveThread.pid,
      tty: process.tty,
      sessionId: liveThread.threadId,
      projectDir: path.basename(sessionMeta?.payload?.cwd || process.command),
      cwd: sessionMeta?.payload?.cwd || process.command,
      startedAt: process.startedAt,
      elapsedMs: process.elapsedMs,
      state: inferred.state,
      currentTool: inferred.currentTool,
      lastEventAt: activity.lastEventAt || liveThread.ts,
      lastSummary: inferred.summary,
      usage: normalizeCodexUsage(activity.rateLimits),
      detailSourcePaths: {
        transcriptPath,
        processUuid: liveThread.processUuid,
        openArtifacts: scanCodexOpenArtifacts(liveThread.pid)
      }
    });
  }

  return { agents, warnings };
}
