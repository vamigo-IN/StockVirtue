'use client';

import type { ReactNode } from 'react';
import { MotionConfig } from 'motion/react';

/**
 * Global motion configuration. `reducedMotion="user"` makes every motion
 * component respect the OS "reduce motion" setting — transform/layout
 * animations are skipped (opacity-only), so the whole site degrades to a
 * calm, still experience for those users without any per-component checks.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user" transition={{ ease: [0.22, 1, 0.36, 1] }}>
      {children}
    </MotionConfig>
  );
}
