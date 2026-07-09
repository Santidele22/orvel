#!/usr/bin/env node

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const targets = process.argv.slice(2);
const scanRoots = targets.length > 0 ? targets : ["."];

const ignoredDirectories = new Set([
  ".git",
  ".funemon",
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".angular",
  ".astro",
  ".turbo",
  ".vercel",
]);

const blockedPatterns = [
  { label: "Deno.test.only", pattern: /\bDeno\s*\.\s*test\s*\.\s*only\s*\(/ },
  { label: "describe.only", pattern: /\bdescribe\s*\.\s*only\s*\(/ },
  { label: "it.only", pattern: /\bit\s*\.\s*only\s*\(/ },
  { label: "test.only", pattern: /\btest\s*\.\s*only\s*\(/ },
  { label: "only: true", pattern: /\bonly\s*:\s*true\b/ },
];

function collectFiles(path) {
  const stat = statSync(path);
  if (stat.isFile()) return [path];
  if (!stat.isDirectory()) return [];

  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) return [];
    const childPath = join(path, entry.name);
    if (entry.isDirectory()) return collectFiles(childPath);
    return entry.isFile() ? [childPath] : [];
  });
}

const files = scanRoots
  .flatMap(collectFiles)
  .filter((file) => /\.(test|spec)\.(ts|tsx|js|jsx|mjs|cjs)$/.test(file));

const failures = [];

for (const file of files) {
  const content = readFileSync(file, "utf8");
  const lines = content.split(/\r?\n/);
  lines.forEach((line, index) => {
    for (const { label, pattern } of blockedPatterns) {
      if (pattern.test(line)) {
        failures.push(`${file}:${index + 1}: focused test modifier is not allowed (${label})`);
      }
    }
  });
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(`Focused test guard passed (${files.length} files checked).`);
