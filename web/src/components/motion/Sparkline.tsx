'use client';

import { useId } from 'react';
import { motion } from 'motion/react';

/**
 * A small SVG sparkline that draws itself (stroke reveal) when it scrolls into
 * view, with a soft area fill beneath. Points are normalized to a 100×32
 * viewBox. Static full path under reduced motion (motion handles this).
 */
export function Sparkline({
  points,
  width = 100,
  height = 32,
  area = true,
  className,
}: {
  points: number[];
  width?: number;
  height?: number;
  area?: boolean;
  className?: string;
}) {
  const id = useId().replace(/:/g, '');
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const step = width / (points.length - 1);
  const coords = points.map((p, i) => {
    const x = i * step;
    const y = height - ((p - min) / span) * (height - 4) - 2;
    return [x, y] as const;
  });
  const line = coords
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(' ');
  const fill = `${line} L${width},${height} L0,${height} Z`;

  return (
    <svg
      className={`spark${className ? ` ${className}` : ''}`}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`sf-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(34,197,94,0.35)" />
          <stop offset="100%" stopColor="rgba(34,197,94,0)" />
        </linearGradient>
      </defs>
      {area && <path className="area" d={fill} fill={`url(#sf-${id})`} />}
      <motion.path
        className="line"
        d={line}
        initial={{ pathLength: 0, opacity: 0 }}
        whileInView={{ pathLength: 1, opacity: 1 }}
        viewport={{ once: true, amount: 0.6 }}
        transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
      />
    </svg>
  );
}
