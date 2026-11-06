import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Logger } from '@nestjs/common';

/**
 * The site-content data files (seed/legal/*.json, nav-widths.json) live next
 * to the code in src/site-content. `nest build` compiles TypeScript only and
 * doesn't copy JSON into dist, so the compiled code looks for them next to
 * itself first (jest, ts-node, or a build that copies assets) and then in the
 * source tree the build came from (dist/site-content → src/site-content).
 */
const logger = new Logger('SiteContentData');

export function dataFilePath(rel: string): string | null {
  const candidates = [
    join(__dirname, rel),
    resolve(__dirname, '..', '..', 'src', 'site-content', rel),
    resolve(process.cwd(), 'src', 'site-content', rel),
    resolve(process.cwd(), 'backend', 'src', 'site-content', rel),
  ];
  return candidates.find((p) => existsSync(p)) ?? null;
}

/** The parsed JSON file, or null (logged) when it can't be found or read. */
export function readJsonData<T>(rel: string): T | null {
  const path = dataFilePath(rel);
  if (!path) {
    logger.error(`Site content data file not found: ${rel} (looked next to ${__dirname} and in src/site-content).`);
    return null;
  }
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch (err) {
    logger.error(`Site content data file ${path} can't be read: ${(err as Error).message}`);
    return null;
  }
}
