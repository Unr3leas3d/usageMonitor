import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { intro, outro, spinner, log } from "@clack/prompts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");

function getLocalVersion() {
  const pkg = JSON.parse(readFileSync(join(projectRoot, "package.json"), "utf8"));
  return pkg.version;
}

function isGitInstall() {
  try {
    execFileSync("git", ["rev-parse", "--git-dir"], {
      cwd: projectRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return true;
  } catch {
    return false;
  }
}

function updateFromGit() {
  execFileSync("git", ["pull", "--ff-only"], {
    cwd: projectRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  execFileSync("npm", ["install", "--no-audit", "--no-fund"], {
    cwd: projectRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function updateFromNpm() {
  execFileSync("npm", ["install", "-g", "vibe-meter@latest"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

export async function runUpdate() {
  intro("vibe-meter update");

  const oldVersion = getLocalVersion();
  const gitInstall = isGitInstall();

  const s = spinner();
  s.start(gitInstall ? "Pulling latest from git..." : "Updating from npm...");

  try {
    if (gitInstall) {
      updateFromGit();
    } else {
      updateFromNpm();
    }
    s.stop("Update complete.");
  } catch (error) {
    s.stop("Update failed.");
    log.error(error.message || String(error));
    process.exitCode = 1;
    return;
  }

  const newVersion = getLocalVersion();

  if (oldVersion === newVersion) {
    log.info(`Already up to date (v${oldVersion}).`);
  } else {
    log.success(`Updated v${oldVersion} → v${newVersion}.`);
  }

  outro("Done.");
}
