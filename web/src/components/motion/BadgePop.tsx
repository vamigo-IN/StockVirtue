'use client';

import type { ReactNode } from 'react';
import { motion } from 'motion/react';

/**
 * Achievement-style pop: springs in with a slight overshoot + rotate when it
 * scrolls into view. Under reduced motion it simply appears (handled by the
 * spring collapsing to no movement is not automatic, so we gate via a static
 * fallback in globals — here we keep the transform tiny and safe).
 */
export function BadgePop({
  children,
  index = 0,
  className,
}: {
  children: ReactNode;
  index?: number;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, scale: 0.6, rotate: -6 }}
      whileInView={{ opacity: 1, scale: 1, rotate: 0 }}
      viewport={{ once: true, amount: 0.6 }}
      transition={{
        type: 'spring',
        stiffness: 320,
        damping: 16,
        delay: index * 0.09,
      }}
    >
      {children}
    </motion.div>
  );
}
