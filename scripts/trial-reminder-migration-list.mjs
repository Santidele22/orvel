export function validateMigrationList(output, expectedVersion, expectedState = "applied") {
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
  const expectedRows = rows.filter((row) => row.local === expectedVersion);
  if (expectedRows.length !== 1) {
    throw new Error("migration alignment failed");
  }
  if (rows.some((row) => !row.local)) throw new Error("migration alignment failed");
  if (expectedState === "applied" && rows.some((row) => row.local !== row.remote)) {
    throw new Error("migration alignment failed");
  }
  if (expectedState === "pending" && rows.some((row) => (
    row.local === expectedVersion ? row.remote !== "" : row.local !== row.remote
  ))) throw new Error("migration alignment failed");
  return { migration_alignment: "aligned" };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let input = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => input += chunk);
  process.stdin.on("end", () => {
    try {
      validateMigrationList(input, process.argv[2], process.argv[3]);
      process.stdout.write("migration_alignment=aligned\n");
    } catch {
      process.stderr.write("migration_alignment_failed\n");
      process.exit(1);
    }
  });
}
