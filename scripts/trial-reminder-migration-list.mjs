export function validateMigrationList(output, expectedVersions, expectedState = "applied") {
  const expected = Array.isArray(expectedVersions) ? expectedVersions : [expectedVersions];
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
  if (!rows.length || !["applied", "pending"].includes(expectedState)) {
    throw new Error("migration alignment failed");
  }
  const expectedRows = rows.filter((row) => expected.includes(row.local));
  if (expectedRows.length !== expected.length
    || expected.some((version, index) => expectedRows[index]?.local !== version)
    || expected.some((version, index) => rows.at(index - expected.length)?.local !== version)) {
    throw new Error("migration alignment failed");
  }
  if (rows.some((row) => !row.local)) throw new Error("migration alignment failed");
  if (expectedState === "applied" && rows.some((row) => row.local !== row.remote)) {
    throw new Error("migration alignment failed");
  }
  if (expectedState === "pending" && rows.some((row) => (
    expected.includes(row.local) ? row.remote !== "" : row.local !== row.remote
  ))) throw new Error("migration alignment failed");
  return { migration_alignment: "aligned" };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let input = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => input += chunk);
  process.stdin.on("end", () => {
    try {
      const state = process.argv.at(-1);
      const hasState = ["applied", "pending"].includes(state);
      validateMigrationList(input, process.argv.slice(2, hasState ? -1 : undefined), hasState ? state : "applied");
      process.stdout.write("migration_alignment=aligned\n");
    } catch {
      process.stderr.write("migration_alignment_failed\n");
      process.exit(1);
    }
  });
}
