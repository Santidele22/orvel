/**
 * Vite `?raw` imports resolve to the file contents as a string.
 *
 * Declared explicitly because `apps/dashboard/tsconfig.spec.json` does not
 * include `vite/client` types, and because reading source files with `node:fs`
 * would require Node typings that the same config does not enable either.
 */
declare module '*?raw' {
  const content: string;
  export default content;
}
