export function validateDryRun(output, expectedVersions) {
  const expected = Array.isArray(expectedVersions) ? expectedVersions : [expectedVersions];
  const versions = [];
  let sawPlanHeading = false;

  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (/^(DRY RUN:|Finished supabase db push\.|Connecting to remote database\.\.\.)/i.test(line)) continue;
    if (/^Would push these migrations:?$/i.test(line)) {
      if (sawPlanHeading) throw new Error("dry-run migration plan failed");
      sawPlanHeading = true;
      continue;
    }
    const match = /^(?:[-•]\s*)?(\d{14})(?:_[a-z0-9_]+)?\.sql$/i.exec(line);
    if (!sawPlanHeading || !match) throw new Error("dry-run migration plan failed");
    versions.push(match[1]);
  }

  if (!sawPlanHeading || versions.length !== expected.length || versions.some((version, index) => version !== expected[index])) {
    throw new Error("dry-run migration plan failed");
  }
  return { pending_migrations: expected };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let input = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => input += chunk);
  process.stdin.on("end", () => {
    try {
      const result = validateDryRun(input, process.argv.slice(2));
      process.stdout.write(`pending_migrations=${result.pending_migrations.join(",")}\n`);
    } catch {
      process.stderr.write("dry_run_migration_plan_failed\n");
      process.exit(1);
    }
  });
}
