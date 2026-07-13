export function validateMigrationList(output, expectedVersions, expectedState = "detect") {
  const expected = Array.isArray(expectedVersions) ? expectedVersions : [expectedVersions];
  if (expected.length !== 2) throw new Error("migration alignment failed");
  const rows = [];
  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (/^Local\s*\|\s*Remote\s*\|\s*Time(?:\s*\(UTC\))?$/i.test(line)) continue;
    if (/^[\s|:-]+$/.test(line)) continue;
    const match = /^`([^`]*)`\s*\|\s*`([^`]*)`\s*\|\s*.+$/.exec(line);
    if (!match) throw new Error("migration alignment failed");
    rows.push({ local: match[1].trim(), remote: match[2].trim() });
  }
  if (!rows.length || !["detect", "two_pending", "acl_applied_generic_pending", "fully_applied"].includes(expectedState)) {
    throw new Error("migration alignment failed");
  }
  const expectedRows = rows.filter((row) => expected.includes(row.local));
  if (expectedRows.length !== expected.length
    || expected.some((version, index) => expectedRows[index]?.local !== version)
    || expected.some((version, index) => rows.at(index - expected.length)?.local !== version)) {
    throw new Error("migration alignment failed");
  }
  if (rows.some((row) => !row.local || (!expected.includes(row.local) && row.local !== row.remote))) {
    throw new Error("migration alignment failed");
  }

  const [aclRow, genericRow] = expectedRows;
  let migrationState;
  if (!aclRow.remote && !genericRow.remote) migrationState = "two_pending";
  else if (aclRow.remote === aclRow.local && !genericRow.remote) migrationState = "acl_applied_generic_pending";
  else if (aclRow.remote === aclRow.local && genericRow.remote === genericRow.local) migrationState = "fully_applied";
  else throw new Error("migration alignment failed");

  if (expectedState !== "detect" && expectedState !== migrationState) {
    throw new Error("migration alignment failed");
  }
  return { migration_alignment: "aligned", migration_state: migrationState };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let input = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => input += chunk);
  process.stdin.on("end", () => {
    try {
      const state = process.argv.at(-1);
      const hasState = ["detect", "two_pending", "acl_applied_generic_pending", "fully_applied"].includes(state);
      const result = validateMigrationList(input, process.argv.slice(2, hasState ? -1 : undefined), hasState ? state : "detect");
      process.stdout.write(`migration_alignment=aligned\nmigration_state=${result.migration_state}\n`);
    } catch {
      process.stderr.write("migration_alignment_failed\n");
      process.exit(1);
    }
  });
}
