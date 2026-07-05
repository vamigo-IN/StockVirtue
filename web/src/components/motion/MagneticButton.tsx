'use client';

import {
  useRef,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { motion, useMotionValue, useSpring } from 'motion/react';

/**
 * Wraps a CTA so it gently drifts toward the cursor on hover, then springs
 * back on leave — the classic "magnetic" micro-interaction. Renders an <a>
 * (external/Play links) or a plain motion.div. Skips the effect on touch and
 * for reduced-motion users (they get a normal, static control).
 */
export function MagneticButton({
  children,
  href,
  className,
  strength = 0.35,
  external = true,
}: {
  children: ReactNode;
  href?: string;
  className?: string;
  strength?: number;
  external?: boolean;
}) {
  const ref = useRef<HTMLAnchorElement & HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 220, damping: 18, mass: 0.4 });
  const sy = useSpring(y, { stiffness: 220, damping: 18, mass: 0.4 });

  const onMove = (e: ReactPointerEvent) => {
    if (e.pointerType === 'touch') return;
    if (
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return;
    }
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    x.set((e.clientX - (r.left + r.width / 2)) * strength);
    y.set((e.clientY - (r.top + r.height / 2)) * strength);
  };
  const reset = () => {
    x.set(0);
    y.set(0);
  };

  const common = {
    ref,
    className,
    style: { x: sx, y: sy },
    onPointerMove: onMove,
    onPointerLeave: reset,
  } as const;

  if (href) {
    return (
      <motion.a
        {...common}
        href={href}
        {...(external ? { target: '_blank', rel: 'noopener' } : {})}
      >
        {children}
      </motion.a>
    );
  }
  return <motion.div {...common}>{children}</motion.div>;
}
