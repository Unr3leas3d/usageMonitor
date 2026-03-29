import fs from "node:fs";

import { getCachePaths, pathExists } from "./paths.js";
import { parseJson } from "./utils.js";

export function loadJsonFile(filePath, fallback) {
  try {
    if (!pathExists(filePath)) {
      return fallback;
    }

    return parseJson(fs.readFileSync(filePath, "utf8"), fallback);
  } catch {
    return fallback;
  }
}

export function saveJsonFile(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

export function loadIndex(indexPath) {
  return loadJsonFile(indexPath, {});
}

export function saveIndex(indexPath, data) {
  saveJsonFile(indexPath, data);
}

export function loadLatestSnapshot() {
  const { snapshotPath } = getCachePaths();
  return loadJsonFile(snapshotPath, null);
}

export function saveLatestSnapshot(snapshot) {
  const { snapshotPath } = getCachePaths();
  saveJsonFile(snapshotPath, snapshot);
}
