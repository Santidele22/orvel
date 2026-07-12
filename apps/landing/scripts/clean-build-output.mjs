import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const landingRoot = resolve(__dirname, '..');

const generatedOutputs = [
  'dist',
  '.vercel/output',
  '.astro',
];

export async function cleanBuildOutput() {
  await Promise.all(
    generatedOutputs.map((relativePath) =>
      rm(resolve(landingRoot, relativePath), { recursive: true, force: true })
    ),
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await cleanBuildOutput();
}
