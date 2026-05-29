declare module 'node:fs/promises' {
  interface DirectoryEntryLike {
    name: string;
    isDirectory(): boolean;
    isFile(): boolean;
  }

  export function readdir(
    path: string,
    options: { withFileTypes: true }
  ): Promise<DirectoryEntryLike[]>;

  export function readFile(path: string, encoding: 'utf-8'): Promise<string>;
}

declare module 'node:path' {
  export function join(...paths: string[]): string;
  export function resolve(...paths: string[]): string;
}
