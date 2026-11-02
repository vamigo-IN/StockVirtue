import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import {
  access,
  constants,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  statfs,
  writeFile,
} from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

/** The body was larger than allowed; the partial file is already gone. */
export class TooLargeError extends Error {
  constructor() {
    super('The file is larger than allowed.');
  }
}

export interface LocalFile {
  bytes: number;
  modifiedAt: Date;
}

export interface LocalStatus {
  dir: string;
  writable: boolean;
  /** Space left for this process, or null where the OS won't say. */
  freeBytes: number | null;
  problem: string | null;
}

/// Lowercase first segment, then plain file-name characters only.
const SAFE_KEY = /^[a-z0-9]+(?:\/[A-Za-z0-9._-]+)+$/;

/**
 * Media files on this server's disk, under one folder. Keys map to paths
 * inside it and nothing else: a key that could climb out is refused before
 * it touches the file system. Writes land in a temporary file first, so a
 * reader never sees half a file.
 */
export class LocalStore {
  readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
  }

  path(key: string): string {
    if (!SAFE_KEY.test(key) || key.split('/').some((s) => /^\.+$/.test(s))) {
      throw new Error(`Refused storage key "${key}".`);
    }
    const abs = resolve(this.root, ...key.split('/'));
    if (!abs.startsWith(this.root + sep)) {
      throw new Error(`Refused storage key "${key}".`);
    }
    return abs;
  }

  async stat(key: string): Promise<LocalFile | null> {
    try {
      const s = await stat(this.path(key));
      return s.isFile() ? { bytes: s.size, modifiedAt: s.mtime } : null;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
  }

  getBytes(key: string): Promise<Buffer> {
    return readFile(this.path(key));
  }

  async put(key: string, body: Buffer): Promise<void> {
    const abs = this.path(key);
    await mkdir(dirname(abs), { recursive: true });
    const tmp = `${abs}.${randomUUID()}.part`;
    try {
      await writeFile(tmp, body, { mode: 0o644 });
      await rename(tmp, abs);
    } catch (err) {
      await rm(tmp, { force: true });
      throw err;
    }
  }

  /** Streams a request body to disk, stopping as soon as it passes maxBytes. */
  async putStream(
    key: string,
    source: Readable,
    maxBytes: number,
  ): Promise<number> {
    const abs = this.path(key);
    await mkdir(dirname(abs), { recursive: true });
    const tmp = `${abs}.${randomUUID()}.part`;
    let bytes = 0;
    const limit = new Transform({
      transform(chunk: Buffer, _enc, done) {
        bytes += chunk.length;
        if (bytes > maxBytes) done(new TooLargeError());
        else done(null, chunk);
      },
    });
    try {
      await pipeline(source, limit, createWriteStream(tmp, { mode: 0o644 }));
      await rename(tmp, abs);
      return bytes;
    } catch (err) {
      await rm(tmp, { force: true });
      throw err;
    }
  }

  async delete(key: string): Promise<void> {
    await rm(this.path(key), { force: true });
  }

  /** Deletes files directly in a folder (e.g. "incoming") older than a date. */
  async sweep(folder: string, olderThan: Date): Promise<number> {
    const dir = resolve(this.root, folder);
    if (!dir.startsWith(this.root + sep) || !/^[a-z0-9-]+$/.test(folder)) {
      throw new Error(`Refused folder "${folder}".`);
    }
    let names: string[];
    try {
      names = await readdir(dir);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return 0;
      throw err;
    }
    let removed = 0;
    for (const name of names) {
      const file = resolve(dir, name);
      const s = await stat(file).catch(() => null);
      if (s?.isFile() && s.mtime < olderThan) {
        await rm(file, { force: true });
        removed++;
      }
    }
    return removed;
  }

  /** Space left for this process, or null where the OS won't say. */
  async freeBytes(): Promise<number | null> {
    try {
      await mkdir(this.root, { recursive: true });
      const fs = await statfs(this.root);
      return Number(fs.bavail) * Number(fs.bsize);
    } catch {
      return null;
    }
  }

  /** Whether files can be written here, and the space left. */
  async status(): Promise<LocalStatus> {
    try {
      await mkdir(this.root, { recursive: true });
      await access(this.root, constants.W_OK);
    } catch (err) {
      return {
        dir: this.root,
        writable: false,
        freeBytes: null,
        problem: `This server can't write to ${this.root} (${(err as NodeJS.ErrnoException).code ?? 'error'}).`,
      };
    }
    let freeBytes: number | null = null;
    try {
      const fs = await statfs(this.root);
      freeBytes = Number(fs.bavail) * Number(fs.bsize);
    } catch {
      // Not every platform reports it; the folder is still usable.
    }
    return { dir: this.root, writable: true, freeBytes, problem: null };
  }
}
