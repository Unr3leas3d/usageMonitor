import os from "node:os";
import path from "node:path";
import fs from "node:fs";

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
  return dirPath;
}

export function getAppPaths() {
  const home = os.homedir();

  if (process.platform === "darwin") {
    return {
      cacheDir: ensureDir(path.join(home, "Library", "Caches", "usage-monitor")),
      configDir: ensureDir(path.join(home, "Library", "Application Support", "usage-monitor"))
    };
  }

  const xdgCache = process.env.XDG_CACHE_HOME || path.join(home, ".cache");
  const xdgConfig = process.env.XDG_CONFIG_HOME || path.join(home, ".config");

  return {
    cacheDir: ensureDir(path.join(xdgCache, "usage-monitor")),
    configDir: ensureDir(path.join(xdgConfig, "usage-monitor"))
  };
}

export function getClaudePaths() {
  const root = path.join(os.homedir(), ".claude");

  return {
    root,
    sessionsDir: path.join(root, "sessions"),
    projectsDir: path.join(root, "projects"),
    debugDir: path.join(root, "debug"),
    tasksDir: path.join(root, "tasks"),
    settingsPath: path.join(root, "settings.json"),
    localStatuslineScriptPath: path.join(root, "usage-monitor-statusline.mjs")
  };
}

export function findLatestLogsDb(codexRoot) {
  try {
    const entries = fs.readdirSync(codexRoot);
    const logsFiles = entries
      .filter((name) => /^logs_\d+\.sqlite$/.test(name))
      .sort((a, b) => {
        const numA = Number.parseInt(a.match(/\d+/)[0], 10);
        const numB = Number.parseInt(b.match(/\d+/)[0], 10);
        return numB - numA;
      });
    return logsFiles.length > 0 ? path.join(codexRoot, logsFiles[0]) : null;
  } catch {
    return null;
  }
}

export function getCodexPaths() {
  const root = path.join(os.homedir(), ".codex");

  return {
    root,
    sessionsDir: path.join(root, "sessions"),
    logsDbPath: findLatestLogsDb(root),
    logDir: path.join(root, "log"),
    configPath: path.join(root, "config.toml")
  };
}

export function getCachePaths() {
  const { cacheDir, configDir } = getAppPaths();

  return {
    snapshotPath: path.join(cacheDir, "latest-snapshot.json"),
    claudeStatusDir: ensureDir(path.join(cacheDir, "claude-status")),
    claudeStatusDebugDir: ensureDir(path.join(cacheDir, "claude-status-debug")),
    configDir,
    claudeTranscriptIndexPath: path.join(configDir, "claude-transcripts.json"),
    codexTranscriptIndexPath: path.join(configDir, "codex-transcripts.json"),
    claudeStatuslineBackupPath: path.join(configDir, "claude-statusline-backup.json")
  };
}

export function encodeClaudeProjectPath(cwd) {
  return cwd.replace(/[^A-Za-z0-9]/g, "-");
}

export function pathExists(targetPath) {
  try {
    fs.accessSync(targetPath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export function findFileRecursive(rootDir, matcher) {
  if (!pathExists(rootDir)) {
    return null;
  }

  const stack = [rootDir];

  while (stack.length > 0) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);

      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }

      if (matcher(fullPath, entry.name)) {
        return fullPath;
      }
    }
  }

  return null;
}
