'use client';

import { motion, useScroll, useSpring } from 'motion/react';

/**
 * Thin brand-gradient progress bar pinned to the very top of the viewport
 * that fills as the page is scrolled. Purely decorative (aria-hidden).
 */
export function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 120,
    damping: 30,
    restDelta: 0.001,
  });

  return (
    <motion.div className="scroll-progress" style={{ scaleX }} aria-hidden="true" />
  );
}
