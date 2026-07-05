'use client';

import { motion, type Variants } from 'motion/react';
import type { ReactNode, CSSProperties } from 'react';

type Direction = 'up' | 'down' | 'left' | 'right' | 'none';

const OFFSET = 26;

function offsetFor(dir: Direction) {
  switch (dir) {
    case 'up':
      return { y: OFFSET, x: 0 };
    case 'down':
      return { y: -OFFSET, x: 0 };
    case 'left':
      return { x: OFFSET, y: 0 };
    case 'right':
      return { x: -OFFSET, y: 0 };
    default:
      return { x: 0, y: 0 };
  }
}

/**
 * Scroll-into-view reveal. Fades + slides its child once it enters the
 * viewport. Reduced-motion users get an instant, offset-free fade so the
 * content still appears without movement.
 */
export function Reveal({
  children,
  direction = 'up',
  delay = 0,
  duration = 0.6,
  blur = 6,
  className,
  style,
  as = 'div',
  amount = 0.1,
}: {
  children: ReactNode;
  direction?: Direction;
  delay?: number;
  duration?: number;
  blur?: number;
  className?: string;
  style?: CSSProperties;
  as?: 'div' | 'span' | 'section' | 'li' | 'article' | 'header';
  amount?: number;
}) {
  const { x, y } = offsetFor(direction);
  const MotionTag = motion[as] as typeof motion.div;

  return (
    <MotionTag
      className={className}
      style={style}
      initial={{ opacity: 0, x, y, filter: `blur(${blur}px)` }}
      whileInView={{ opacity: 1, x: 0, y: 0, filter: 'blur(0px)' }}
      viewport={{ once: true, amount, margin: '0px 0px -80px 0px' }}
      transition={{
        duration,
        delay,
        ease: [0.22, 1, 0.36, 1],
      }}
    >
      {children}
    </MotionTag>
  );
}

/**
 * Container that staggers the reveal of its direct children. Pair with
 * <RevealItem> for each child.
 */
export function RevealGroup({
  children,
  className,
  style,
  stagger = 0.08,
  delayChildren = 0,
  amount = 0.08,
  as = 'div',
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  stagger?: number;
  delayChildren?: number;
  amount?: number;
  as?: 'div' | 'ul' | 'section';
}) {
  const container: Variants = {
    hidden: {},
    show: {
      transition: { staggerChildren: stagger, delayChildren },
    },
  };
  const MotionTag = motion[as] as typeof motion.div;
  return (
    <MotionTag
      className={className}
      style={style}
      variants={container}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount, margin: '0px 0px -60px 0px' }}
    >
      {children}
    </MotionTag>
  );
}

export function RevealItem({
  children,
  className,
  direction = 'up',
  duration = 0.55,
  as = 'div',
}: {
  children: ReactNode;
  className?: string;
  direction?: Direction;
  duration?: number;
  as?: 'div' | 'li' | 'article';
}) {
  const { x, y } = offsetFor(direction);
  const item: Variants = {
    hidden: { opacity: 0, x, y },
    show: {
      opacity: 1,
      x: 0,
      y: 0,
      transition: { duration, ease: [0.22, 1, 0.36, 1] },
    },
  };
  const MotionTag = motion[as] as typeof motion.div;
  return (
    <MotionTag className={className} variants={item}>
      {children}
    </MotionTag>
  );
}
