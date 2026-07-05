'use client';

import {
  useRef,
  type ReactNode,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'motion/react';

/**
 * A card that tilts in 3D toward the cursor and shows a soft spotlight that
 * tracks the pointer. Great for the feature grid. Falls back to a plain,
 * static card on touch / reduced-motion.
 */
export function TiltCard({
  children,
  className,
  max = 8,
}: {
  children: ReactNode;
  className?: string;
  max?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);

  const rx = useSpring(useTransform(py, [0, 1], [max, -max]), {
    stiffness: 200,
    damping: 20,
  });
  const ry = useSpring(useTransform(px, [0, 1], [-max, max]), {
    stiffness: 200,
    damping: 20,
  });
  const spotX = useTransform(px, (v) => `${v * 100}%`);
  const spotY = useTransform(py, (v) => `${v * 100}%`);

  const onMove = (e: ReactPointerEvent) => {
    if (e.pointerType === 'touch') return;
    // Motion values are written straight to style, so MotionConfig's
    // reduced-motion gate doesn't reach them — guard here.
    if (
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return;
    }
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    px.set((e.clientX - r.left) / r.width);
    py.set((e.clientY - r.top) / r.height);
  };
  const reset = () => {
    px.set(0.5);
    py.set(0.5);
  };

  return (
    <motion.div
      ref={ref}
      className={`tilt-card${className ? ` ${className}` : ''}`}
      onPointerMove={onMove}
      onPointerLeave={reset}
      style={{ rotateX: rx, rotateY: ry, transformPerspective: 900 }}
    >
      <motion.span
        className="tilt-spotlight"
        aria-hidden="true"
        style={
          {
            '--spot-x': spotX,
            '--spot-y': spotY,
          } as CSSProperties & Record<string, unknown>
        }
      />
      <div className="tilt-inner">{children}</div>
    </motion.div>
  );
}
