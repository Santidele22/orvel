export function validateMigrationList(output, expectedVersion) {
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
  if (!rows.length || rows.some((row) => !row.local || row.local !== row.remote)) {
    throw new Error("migration alignment failed");
  }
  if (rows.filter((row) => row.local === expectedVersion).length !== 1) {
    throw new Error("migration alignment failed");
  }
  return { migration_alignment: "aligned" };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let input = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => input += chunk);
  process.stdin.on("end", () => {
    try {
      validateMigrationList(input, process.argv[2]);
      process.stdout.write("migration_alignment=aligned\n");
    } catch {
      process.stderr.write("migration_alignment_failed\n");
      process.exit(1);
    }
  });
}
