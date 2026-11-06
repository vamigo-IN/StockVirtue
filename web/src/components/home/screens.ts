import { fmtDate } from '@/components/widgets/format';
import { SCREENS, type Screen, type ScreenId } from '@/content/screens';
import type { Callout, HomeContent, SiteScreen } from '@/content/site/types';

/**
 * Screens on the home page (W7 addendum §3.2, §11.3): the content's screen
 * first, SCREENS (src/content/screens.ts, the owner's captures) second, and
 * otherwise none, which the views treat as their text-only layouts (owner
 * decision 6). Pure: server and client code can both use it.
 */

/** "4 Nov 2026" for a capture date (YYYY-MM-DD), for the caption templates. */
export function fmtCaptureDate(ymd: string): string {
  return fmtDate(ymd);
}

/** A content screen, else the SCREENS entry, as a DeviceFrame `Screen`. */
export function resolveScreen(
  content: SiteScreen | null | undefined,
  fallback: ScreenId,
): Screen | null {
  if (content && content.src) return content;
  return SCREENS[fallback] ?? null;
}

/** The SCREENS capture behind each seed step (spec §9.9), by id, then by position. */
const STEP_SCREENS: Record<string, ScreenId> = {
  search: 'search',
  order: 'order-ticket',
  pnl: 'pnl',
};
const STEP_ORDER: ScreenId[] = ['search', 'order-ticket', 'pnl'];

export type StageStep = {
  id: string;
  label: string;
  /** Null when its facts fall back to nothing (the step keeps its label). */
  body: HomeContent['stage']['steps'][number]['body'];
  /** With its callouts: the content's own, else the capture's. */
  screen: Screen | null;
};

/** The stage's steps with their screens resolved. */
export function stageSteps(steps: HomeContent['stage']['steps']): StageStep[] {
  return steps.map((step, i) => {
    const id: ScreenId | undefined = STEP_SCREENS[step.id] ?? STEP_ORDER[i];
    const screen: Screen | null = id
      ? resolveScreen(step.screen, id)
      : step.screen && step.screen.src
        ? step.screen
        : null;
    const callouts: Callout[] = step.callouts?.length ? step.callouts : (screen?.callouts ?? []);
    return {
      id: step.id,
      label: step.label,
      body: step.body,
      screen: screen ? { ...screen, callouts } : null,
    };
  });
}

/** The newest capture date among screens (the stage caption names one date). */
export function latestCapture(screens: readonly (Screen | null)[]): string | null {
  let best = '';
  for (const sc of screens) if (sc?.captured && sc.captured > best) best = sc.captured;
  return best || null;
}
