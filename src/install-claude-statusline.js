import fs from "node:fs";
import path from "node:path";

import { getCachePaths, getClaudePaths, pathExists } from "./paths.js";
import { loadJsonFile, saveJsonFile } from "./cache.js";

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function renderWrapperScript({ backupPath, statusDir, debugDir, scriptPath }) {
  return `#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const BACKUP_PATH = ${JSON.stringify(backupPath)};
const STATUS_DIR = ${JSON.stringify(statusDir)};
const DEBUG_DIR = ${JSON.stringify(debugDir)};
const SCRIPT_PATH = ${JSON.stringify(scriptPath)};

function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => resolve(data));
  });
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function writeDebugSnapshot(sessionId, rawInput, snapshot) {
  const safeSessionId = String(sessionId || "unknown").replace(/[^A-Za-z0-9._-]/g, "_");
  const debugPayload = {
    captured_at: new Date().toISOString(),
    session_id: snapshot?.session_id || null,
    has_rate_limits: snapshot?.rate_limits != null,
    keys: snapshot && typeof snapshot === "object" ? Object.keys(snapshot) : [],
    raw_payload: snapshot,
    raw_input: snapshot ? null : rawInput
  };

  fs.mkdirSync(DEBUG_DIR, { recursive: true });
  fs.writeFileSync(path.join(DEBUG_DIR, \`\${safeSessionId}.json\`), JSON.stringify(debugPayload, null, 2));
}

function projectName(value) {
  if (!value) {
    return "unknown";
  }
  const parts = String(value).split(path.sep).filter(Boolean);
  return parts[parts.length - 1] || value;
}

function defaultOutput(snapshot) {
  const model = snapshot?.model?.display_name || "Claude";
  const cwd = snapshot?.workspace?.current_dir || snapshot?.cwd || "";
  const fiveHour = snapshot?.rate_limits?.five_hour?.used_percentage;
  const sevenDay = snapshot?.rate_limits?.seven_day?.used_percentage;
  const usage = [
    fiveHour == null ? null : \`5h \${Math.round(fiveHour)}%\`,
    sevenDay == null ? null : \`7d \${Math.round(sevenDay)}%\`
  ].filter(Boolean).join(" | ");
  return \`[\${model}] \${projectName(cwd)}\${usage ? " | " + usage : ""}\`;
}

function maybeDelegate(rawInput, fallbackOutput) {
  if (!fs.existsSync(BACKUP_PATH)) {
    return fallbackOutput;
  }

  const backup = parseJson(fs.readFileSync(BACKUP_PATH, "utf8"));
  const previous = backup?.previousStatusLine;

  if (!previous?.command) {
    return fallbackOutput;
  }

  if (previous.command.includes(path.basename(SCRIPT_PATH))) {
    return fallbackOutput;
  }

  const result = spawnSync(previous.command, {
    shell: true,
    input: rawInput,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "inherit"]
  });

  if (result.status === 0 && result.stdout.trim()) {
    return result.stdout.trimEnd();
  }

  return fallbackOutput;
}

const rawInput = await readStdin();
const snapshot = parseJson(rawInput) || {};
const sessionId = snapshot.session_id || "unknown";
const persisted = {
  session_id: snapshot.session_id || null,
  transcript_path: snapshot.transcript_path || null,
  cwd: snapshot.cwd || null,
  workspace: snapshot.workspace || null,
  model: snapshot.model || null,
  context_window: snapshot.context_window || null,
  rate_limits: snapshot.rate_limits || null,
  version: snapshot.version || null,
  captured_at: new Date().toISOString()
};

fs.mkdirSync(STATUS_DIR, { recursive: true });
fs.writeFileSync(path.join(STATUS_DIR, \`\${sessionId}.json\`), JSON.stringify(persisted, null, 2));
writeDebugSnapshot(sessionId, rawInput, parseJson(rawInput));

const output = maybeDelegate(rawInput, defaultOutput(snapshot));
process.stdout.write(output + "\\n");
`;
}

export function installClaudeStatusline() {
  const { settingsPath, localStatuslineScriptPath } = getClaudePaths();
  const { claudeStatuslineBackupPath, claudeStatusDir, claudeStatusDebugDir } = getCachePaths();
  const settings = loadJsonFile(settingsPath, {});
  const existingStatusLine = settings.statusLine ?? null;
  const wrapperCommand = `node ${shellQuote(localStatuslineScriptPath)}`;

  saveJsonFile(claudeStatuslineBackupPath, {
    installedAt: new Date().toISOString(),
    scriptPath: localStatuslineScriptPath,
    previousStatusLine:
      existingStatusLine?.command === wrapperCommand
        ? loadJsonFile(claudeStatuslineBackupPath, null)?.previousStatusLine ?? null
        : existingStatusLine
  });

  fs.writeFileSync(
    localStatuslineScriptPath,
    renderWrapperScript({
      backupPath: claudeStatuslineBackupPath,
      statusDir: claudeStatusDir,
      debugDir: claudeStatusDebugDir,
      scriptPath: localStatuslineScriptPath
    }),
    "utf8"
  );
  fs.chmodSync(localStatuslineScriptPath, 0o755);

  settings.statusLine = {
    type: "command",
    command: wrapperCommand,
    padding: existingStatusLine?.padding ?? 0
  };

  saveJsonFile(settingsPath, settings);

  return {
    settingsPath,
    scriptPath: localStatuslineScriptPath,
    backupPath: claudeStatuslineBackupPath,
    delegated: Boolean(existingStatusLine?.command && existingStatusLine.command !== wrapperCommand)
  };
}

export function uninstallClaudeStatusline() {
  const { settingsPath, localStatuslineScriptPath } = getClaudePaths();
  const { claudeStatuslineBackupPath } = getCachePaths();
  const settings = loadJsonFile(settingsPath, {});
  const backup = loadJsonFile(claudeStatuslineBackupPath, null);

  if (backup?.previousStatusLine) {
    settings.statusLine = backup.previousStatusLine;
  } else {
    delete settings.statusLine;
  }

  saveJsonFile(settingsPath, settings);

  if (pathExists(localStatuslineScriptPath)) {
    fs.unlinkSync(localStatuslineScriptPath);
  }

  if (pathExists(claudeStatuslineBackupPath)) {
    fs.unlinkSync(claudeStatuslineBackupPath);
  }

  return {
    settingsPath,
    restored: Boolean(backup?.previousStatusLine)
  };
}
