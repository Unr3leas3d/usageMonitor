import fs from "node:fs";

import { parseJson } from "./utils.js";

export function readFirstJsonLine(filePath) {
  const fd = fs.openSync(filePath, "r");

  try {
    const stat = fs.fstatSync(fd);
    const bytes = Math.min(stat.size, 64 * 1024);
    const buffer = Buffer.alloc(bytes);
    fs.readSync(fd, buffer, 0, bytes, 0);
    const text = buffer.toString("utf8");
    const [line] = text.split(/\r?\n/, 1);
    return parseJson(line, null);
  } finally {
    fs.closeSync(fd);
  }
}

export function readLastJsonLines(filePath, options = {}) {
  const maxBytes = options.maxBytes ?? 256 * 1024;
  const maxLines = options.maxLines ?? 200;
  const fd = fs.openSync(filePath, "r");

  try {
    const stat = fs.fstatSync(fd);
    const start = Math.max(0, stat.size - maxBytes);
    const bytesToRead = stat.size - start;
    const buffer = Buffer.alloc(bytesToRead);
    fs.readSync(fd, buffer, 0, bytesToRead, start);

    let text = buffer.toString("utf8");
    if (start > 0) {
      const firstNewline = text.indexOf("\n");
      text = firstNewline >= 0 ? text.slice(firstNewline + 1) : "";
    }

    return text
      .split(/\r?\n/)
      .filter(Boolean)
      .slice(-maxLines)
      .map((line) => parseJson(line, null))
      .filter(Boolean);
  } finally {
    fs.closeSync(fd);
  }
}
