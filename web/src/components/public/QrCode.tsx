import 'server-only';
import { create } from 'qrcode';
import { cn } from '@/lib/utils';

/** The caption spec §4.6 and §9.6.1 give every QR on the site. */
export const QR_CAPTION = "Scan with your phone's camera to open the Play Store.";

/**
 * The Play link a QR opens: the listing plus a referrer, so installs from
 * the QR can be told apart (spec §4.6). `&` when the URL already has a
 * query, `?` otherwise.
 */
export function qrTarget(playUrl: string): string {
  const sep = playUrl.includes('?') ? '&' : '?';
  return `${playUrl}${sep}referrer=utm_source%3Dweb_qr`;
}

/**
 * The modules as one SVG path, one run of dark modules per subpath, in
 * module units (the viewBox is size × size).
 */
function modulePath(text: string): { size: number; d: string } {
  const qr = create(text, { errorCorrectionLevel: 'M' });
  const { size } = qr.modules;
  let d = '';
  for (let y = 0; y < size; y += 1) {
    let x = 0;
    while (x < size) {
      if (!qr.modules.get(y, x)) {
        x += 1;
        continue;
      }
      let run = 1;
      while (x + run < size && qr.modules.get(y, x + run)) run += 1;
      d += `M${x} ${y}h${run}v1h-${run}z`;
      x += run;
    }
  }
  return { size, d };
}

/**
 * The QR code to the Play listing (spec §4.6). A SERVER component: the
 * `qrcode` package runs at render time and the page gets an inline SVG
 * (no client JS, no image request).
 *
 * - Error correction M, no quiet zone in the drawing, ink modules on a
 *   transparent ground. The white box around it (16 px padding) is the
 *   quiet zone, so it scans on paper, on white and on the dark stage.
 * - `size` is the drawing's width in px: 176 on the home page, 200 on
 *   /download, 120 in the news house ad.
 * - The caption defaults to "Scan with your phone's camera to open the
 *   Play Store."; pass `caption={null}` to leave it out.
 * - The drawing is aria-hidden (a screen reader can't use it); the Play
 *   badge next to it is the accessible way to the listing.
 * - Callers show it at >= 768 px only (phones install from the badge).
 */
export function QrCode({
  url,
  size,
  caption = QR_CAPTION,
  className,
}: {
  /** The Play listing (playStoreUrl(settings)); the referrer is added here. */
  url: string;
  size: 120 | 176 | 200;
  caption?: string | null;
  className?: string;
}) {
  const { size: n, d } = modulePath(qrTarget(url));
  return (
    <div className={cn('sv-qr', className)}>
      <div className="sv-qr-box">
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${n} ${n}`}
          shapeRendering="crispEdges"
          aria-hidden="true"
          focusable="false"
        >
          <path d={d} fill="#111714" />
        </svg>
      </div>
      {caption ? (
        <p className="t-meta text-fg-2" style={{ maxWidth: size + 32 }}>
          {caption}
        </p>
      ) : null}
    </div>
  );
}
