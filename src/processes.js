import { execFileSync } from "node:child_process";

import { parseElapsedToMs } from "./utils.js";

function runCommand(file, args) {
  return execFileSync(file, args, {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"]
  });
}

export function listProcesses() {
  const output = runCommand("ps", [
    "-Ao",
    "pid=,ppid=,lstart=,etime=,stat=,tty=,command="
  ]);

  return output
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const match = line.match(
        /^\s*(\d+)\s+(\d+)\s+(\w+\s+\w+\s+\w+\s+\d+:\d+:\d+\s+\d{4})\s+(\S+)\s+(\S+)\s+(\S+)\s+(.*)$/
      );

      if (!match) {
        return null;
      }

      const [, pid, ppid, lstart, etime, stat, tty, command] = match;
      return {
        pid: Number.parseInt(pid, 10),
        ppid: Number.parseInt(ppid, 10),
        startedAt: new Date(lstart).toISOString(),
        elapsedText: etime,
        elapsedMs: parseElapsedToMs(etime),
        stat,
        tty,
        command
      };
    })
    .filter(Boolean);
}

export function listOpenFiles(pid) {
  const output = runCommand("lsof", ["-Fn", "-p", String(pid)]);
  return output
    .split(/\r?\n/)
    .filter((line) => line.startsWith("n"))
    .map((line) => line.slice(1));
}
