import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const functionName = "send-trial-user-activation-reminder-once";

export async function retrieveServiceRoleAndInvoke({ projectRef, runCli, fetcher, assertCoreDumpsDisabled }) {
  let apiKeyOutput = "";
  let serviceRoleKey = "";
  try {
    if (typeof assertCoreDumpsDisabled !== "function" || !await assertCoreDumpsDisabled()) {
      throw new Error("core dumps are not disabled");
    }
    apiKeyOutput = await runCli([
      "projects", "api-keys", "--project-ref", projectRef, "--output", "json",
    ]);
    const keys = JSON.parse(apiKeyOutput);
    if (!Array.isArray(keys)) throw new Error("invalid API-key schema");
    const allowedNames = new Set(["anon", "service_role", "publishable", "secret"]);
    const seenNames = new Set();
    for (const entry of keys) {
      const canonicalKeys = entry && typeof entry === "object" && !Array.isArray(entry)
        ? Object.keys(entry).sort()
        : [];
      if (
        !entry || typeof entry !== "object" || Array.isArray(entry) ||
        canonicalKeys.length !== 2 || canonicalKeys[0] !== "api_key" || canonicalKeys[1] !== "name" ||
        !Object.hasOwn(entry, "name") || !Object.hasOwn(entry, "api_key") ||
        Object.hasOwn(entry, "key") || Object.hasOwn(entry, "value") ||
        typeof entry.name !== "string" || !allowedNames.has(entry.name) || seenNames.has(entry.name) ||
        typeof entry.api_key !== "string" || !entry.api_key ||
        entry.api_key.trim() !== entry.api_key || /\s/.test(entry.api_key)
      ) throw new Error("invalid API-key schema");
      seenNames.add(entry.name);
    }
    const serviceRoles = keys.filter((entry) => entry.name === "service_role");
    if (serviceRoles.length !== 1) throw new Error("invalid service-role cardinality");
    const serviceRole = serviceRoles[0];
    if (
      typeof serviceRole.api_key !== "string"
    ) throw new Error("invalid service-role key");
    serviceRoleKey = serviceRole.api_key;

    const response = await fetcher(
      `https://${projectRef}.supabase.co/functions/v1/${functionName}`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${serviceRoleKey}`,
          apikey: serviceRoleKey,
          "content-type": "application/json",
        },
        body: "{}",
      },
    );
    return { status: response.status };
  } catch {
    throw new Error("invocation outcome unknown; never retry");
  } finally {
    serviceRoleKey = "";
    apiKeyOutput = "";
  }
}

function runCli(args) {
  const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  const version = packageJson.config?.supabaseCliVersion;
  if (!/^\d+\.\d+\.\d+$/.test(version ?? "")) throw new Error("SUPABASE_CLI_VERSION_INVALID");
  const result = spawnSync("npx", [`supabase@${version}`, ...args], {
    encoding: "utf8",
    timeout: 60_000,
    maxBuffer: 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error || result.status !== 0) throw new Error("api-key retrieval failed");
  return result.stdout;
}

function inheritedCoreDumpsDisabled() {
  const result = spawnSync("bash", ["-c", "ulimit -c"], {
    encoding: "utf8",
    timeout: 5_000,
    stdio: ["ignore", "pipe", "ignore"],
  });
  return !result.error && result.status === 0 && result.stdout.trim() === "0";
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const projectRef = process.argv[2];
  if (!projectRef) process.exit(2);
  try {
    const result = await retrieveServiceRoleAndInvoke({
      projectRef,
      runCli,
      assertCoreDumpsDisabled: inheritedCoreDumpsDisabled,
      fetcher: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(30_000) }),
    });
    process.stdout.write(`invocation_http_status=${result.status}\n`);
  } catch {
    process.stderr.write("invocation_failed_or_unknown; never retry\n");
    process.exit(1);
  }
}
