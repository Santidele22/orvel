#!/usr/bin/env -S -u NODE_OPTIONS -u NODE_PATH -u NODE_CHANNEL_FD -u NODE_CHANNEL_SERIALIZATION_MODE -u NODE_UNIQUE_ID node

import { closeSync, mkdtempSync, openSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const blockedNames = new Set([
  "NODE_OPTIONS", "NODE_PATH", "NODE_CHANNEL_FD", "NODE_CHANNEL_SERIALIZATION_MODE", "NODE_UNIQUE_ID",
  "BASH_ENV", "ENV", "SHELLOPTS", "BASHOPTS", "BASH_XTRACEFD", "PS4",
  "CDPATH", "GLOBIGNORE", "PROMPT_COMMAND", "INPUTRC", "BASH_COMPAT",
  "POSIXLY_CORRECT", "ORVEL_LAUNCH_FD", "ORVEL_LAUNCH_TOKEN",
]);

if (process.platform !== "linux" || process.env.NODE_OPTIONS !== undefined || process.env.NODE_PATH !== undefined) {
  throw new Error("Trusted launcher prerequisites are unavailable");
}
const envCapability = spawnSync("/usr/bin/env", ["-S", "-u NODE_OPTIONS -u NODE_PATH /usr/bin/true"], {
  env: { ...process.env, NODE_OPTIONS: "--invalid-launcher-probe", NODE_PATH: "/invalid-launcher-probe" },
  stdio: "ignore",
});
if (envCapability.error || envCapability.status !== 0) {
  throw new Error("Trusted launcher requires /usr/bin/env with -S and -u support");
}
const childEnv = {};
for (const [name, value] of Object.entries(process.env)) {
  if (blockedNames.has(name) || /^BASH_FUNC_/.test(name) || /^\(\)\s*\{/.test(value)) continue;
  childEnv[name] = value;
}

const token = randomBytes(32).toString("hex");
const tokenDirectory = mkdtempSync(join(tmpdir(), "orvel-reminder-launch-"));
const tokenPath = join(tokenDirectory, "capability");
let tokenFd;
try {
  writeFileSync(tokenPath, `${token}\n`, { mode: 0o600, flag: "wx" });
  tokenFd = openSync(tokenPath, "r");
  unlinkSync(tokenPath);

  childEnv.ORVEL_LAUNCH_FD = "3";
  childEnv.ORVEL_LAUNCH_TOKEN = token;
  const script = resolve(dirname(fileURLToPath(import.meta.url)), "trial-reminder-production.sh");
  const result = spawnSync("/bin/bash", ["--noprofile", "--norc", script, ...process.argv.slice(2)], {
    env: childEnv,
    stdio: ["inherit", "inherit", "inherit", tokenFd],
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  if (tokenFd !== undefined) closeSync(tokenFd);
  rmSync(tokenDirectory, { recursive: true, force: true });
}
