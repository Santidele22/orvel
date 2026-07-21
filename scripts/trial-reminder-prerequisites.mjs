import { spawnSync } from "node:child_process";

const checks = [
  ["npx", ["--version"]],
  ["sha256sum", ["--version"]],
  ["timeout", ["--foreground", "1s", "true"]],
];

for (const [command, args] of checks) {
  const result = spawnSync(command, args, { stdio: "ignore", timeout: 5_000 });
  if (result.error || result.status !== 0) {
    process.stderr.write("host_prerequisites_failed\n");
    process.exit(1);
  }
}
