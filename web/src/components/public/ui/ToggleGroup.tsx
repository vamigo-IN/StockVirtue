'use client';

import { ToggleGroup as ToggleGroupPrimitive } from 'radix-ui';
import { useState, type ComponentProps, type ReactNode } from 'react';
import { clsx } from 'clsx';

/**
 * A single-choice Radix ToggleGroup, styled with the tokens (spec §4.14):
 * chart ranges ("3 months · 6 months · 1 year"), Candles · Compare, the
 * cap-size switch. Like Tabs it ships in the initial bundle.
 *
 * - `variant="segmented"` (default): a `--sv-surface-2` track; the chosen
 *   item is white with a 2 px `--sv-selected` (ink) outline.
 *   `variant="line"`: the same look as Tabs (a 2 px bar under the choice).
 * - Items are 44 px targets in the `label` type.
 * - One item is always chosen: pressing the chosen item again keeps it
 *   (Radix would otherwise clear the value). Works controlled (`value` +
 *   `onValueChange`) or uncontrolled (`defaultValue`).
 * - `label` names the group for screen readers (`aria-label`); items take
 *   their own `aria-label` when their text is short ("1Y").
 * - `scrollable` lets a long group scroll sideways (the commodity list on
 *   phones). A disabled item says why in visible text near the group.
 *
 * ```tsx
 * <ToggleGroup label="Chart range" value={range} onValueChange={setRange}>
 *   <ToggleGroupItem value="1M">3 months</ToggleGroupItem>
 *   <ToggleGroupItem value="6M">6 months</ToggleGroupItem>
 * </ToggleGroup>
 * ```
 */
export function ToggleGroup({
  label,
  value,
  defaultValue,
  onValueChange,
  variant = 'segmented',
  scrollable = false,
  disabled,
  className,
  children,
  ...rest
}: {
  /** The group's accessible name. */
  label: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  variant?: 'segmented' | 'line';
  scrollable?: boolean;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
} & Omit<
  ComponentProps<'div'>,
  'defaultValue' | 'onChange' | 'dir' | 'children' | 'className'
>) {
  const [inner, setInner] = useState(defaultValue ?? '');
  const current = value ?? inner;
  return (
    <ToggleGroupPrimitive.Root
      {...rest}
      type="single"
      aria-label={label}
      value={current}
      disabled={disabled}
      onValueChange={(next) => {
        if (!next) return; // keep the current choice
        if (value === undefined) setInner(next);
        onValueChange?.(next);
      }}
      className={clsx('sv-toggles', className)}
      data-variant={variant}
      data-scroll={scrollable ? '' : undefined}
    >
      {children}
    </ToggleGroupPrimitive.Root>
  );
}

export function ToggleGroupItem({
  className,
  ...props
}: ComponentProps<typeof ToggleGroupPrimitive.Item>) {
  return (
    <ToggleGroupPrimitive.Item className={clsx('sv-toggle', className)} {...props} />
  );
}
