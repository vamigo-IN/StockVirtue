import { pipeline } from 'node:stream';
import { Logger } from '@nestjs/common';
import type { Request, RequestHandler, Response } from 'express';
import { mediaContentType } from './media-keys';
import { StorageService } from './storage.service';

const logger = new Logger('MediaFiles');

/// File names are unique per version, so any cache may keep them forever.
const IMMUTABLE = 'public, max-age=31536000, immutable';

/** Headers for every library file: public, cacheable, never executable. */
function fileHeaders(res: Response, type: string) {
  res.setHeader('Content-Type', type);
  res.setHeader('Cache-Control', IMMUTABLE);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // Our website, the app, social previews and push notifications all show
  // these images from other origins.
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
  );
}

function notFound(res: Response) {
  res
    .status(404)
    .setHeader('Cache-Control', 'public, max-age=60')
    .type('text/plain')
    .send('Not found');
}

/**
 * The media library at /media/<yyyy>/<mm>/<file>, mounted in main.ts ahead of
 * the API. A file on this server's disk is sent from there; any other comes
 * from Cloudflare R2 through the saved connection, so the bucket stays private
 * and needs no public domain, and links never expire (search engines, social
 * previews and push notifications keep them). Only library files are served:
 * uploads still waiting to be checked live under other keys.
 */
export function mediaFiles(storage: StorageService): RequestHandler {
  return (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.setHeader('Allow', 'GET, HEAD');
      res.status(405).end();
      return;
    }
    const key = `media${req.path}`;
    const type = mediaContentType(key);
    if (!type) return notFound(res);
    serve(storage, key, type, req, res).catch((err: Error) => {
      if (res.headersSent) {
        res.destroy();
        return;
      }
      logger.warn(`Couldn't serve ${key}: ${err.message}`);
      res
        .status(502)
        .setHeader('Cache-Control', 'no-store')
        .type('text/plain')
        .send('This image is unavailable right now.');
    });
  };
}

async function serve(
  storage: StorageService,
  key: string,
  type: string,
  req: Request,
  res: Response,
): Promise<void> {
  if (await storage.local.stat(key)) {
    fileHeaders(res, type);
    // send handles HEAD, ETag / Last-Modified revalidation and ranges.
    return new Promise((done) => {
      // Relative to the folder, so only the key is checked for dot names
      // (the folder itself may sit anywhere).
      res.sendFile(
        key,
        { root: storage.local.root, cacheControl: false, dotfiles: 'deny' },
        (err) => {
          // A reader leaving mid-file is no error; a file deleted since the
          // check above is simply gone.
          if (err && !res.headersSent) notFound(res);
          done();
        },
      );
    });
  }

  const r2 = (await storage.connection()).r2;
  if (!r2) return notFound(res);
  if (req.method === 'HEAD') {
    const head = await r2.head(key);
    if (!head) return notFound(res);
    fileHeaders(res, type);
    res.setHeader('Content-Length', String(head.bytes));
    if (head.etag) res.setHeader('ETag', head.etag);
    res.status(200).end();
    return;
  }
  const ifNoneMatch = req.headers['if-none-match'];
  const obj = await r2.open(key, { ifNoneMatch });
  if (obj === null) return notFound(res);
  fileHeaders(res, type);
  if (obj === 'not-modified') {
    res.status(304).end();
    return;
  }
  if (obj.bytes !== null) res.setHeader('Content-Length', String(obj.bytes));
  if (obj.etag) res.setHeader('ETag', obj.etag);
  if (obj.modifiedAt) {
    res.setHeader('Last-Modified', obj.modifiedAt.toUTCString());
  }
  res.status(200);
  return new Promise((done) => pipeline(obj.body, res, () => done()));
}
