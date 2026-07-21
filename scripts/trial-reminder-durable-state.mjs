let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => input += chunk);
process.stdin.on("end", () => {
  const states = [...input.matchAll(/\b(reserved|sent|rejected|ambiguous)\b/g)].map((match) => match[1]);
  const unique = [...new Set(states)];
  if (unique.length !== 1) {
    process.stderr.write("durable_state_unavailable\n");
    process.exit(1);
  }
  process.stdout.write(`${unique[0]}\n`);
});
