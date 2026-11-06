'use client';

import { useState } from 'react';
import { DataNotice } from '@/components/market/DataNotice';
import { HeatGrid } from '@/components/market/HeatGrid';
import { MoversBoard } from '@/components/market/MoversBoard';
import { SectorBars } from '@/components/market/SectorBars';
import { STACKED_PANEL, useMinWidth } from '@/components/market/useMinWidth';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/public/ui/Tabs';
import { niftyFieldAlt } from '@/components/three/nifty-field/NiftyField';
import { useSnapshot } from '@/components/widgets/data';
import { clsx } from 'clsx';
import type { DataRight } from '@/market/types';
import h from './hubs.module.css';

/** The phone card's tabs (spec §5.10.1, §8.1). */
const TABS = [
  { value: 'heatmap', label: 'Heatmap' },
  { value: 'movers', label: 'Movers' },
  { value: 'sectors', label: 'Sectors' },
] as const;
type Tab = (typeof TABS)[number]['value'];

/**
 * The Markets hub's LIVE-only modules (spec §5.10.1, §7.4): HeatGrid (with
 * the Nifty Field as its alternative view), MoversBoard hub and SectorBars
 * full, each mounted ONCE (one subscription each).
 *
 * - Phones: one card with Radix Tabs [Heatmap | Movers | Sectors]; the
 *   modules inside are unboxed (OI-m07-2: no boxes inside a box, and the
 *   tiles get the full width). Inactive panels are hidden, so they fetch
 *   nothing until opened (useInViewMarket never sees them).
 * - From 768 px the tab list hides and the panels stack into the hub grid,
 *   each drawing the hub box (STACKED_PANEL strips their tab semantics).
 * - Not LIVE (the server's licence, then the stream's): ONE DataNotice in
 *   place of the three modules. An upstream failure is each module's own
 *   error line, never the notice.
 */
export function MarketsLive({ initialRight }: { initialRight: DataRight | null }) {
  const snap = useSnapshot(15);
  const right = snap.data?.right ?? initialRight;
  const stacked = useMinWidth(768);
  const [tab, setTab] = useState<Tab>('heatmap');

  if (right && right !== 'LIVE') return <DataNotice />;

  const panel = stacked ? STACKED_PANEL : {};
  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className={h.live}>
      <TabsList aria-label="Market data" className={h.liveTabs}>
        {TABS.map((t) => (
          <TabsTrigger key={t.value} value={t.value}>
            {t.label}
          </TabsTrigger>
        ))}
      </TabsList>
      <TabsContent value="heatmap" forceMount className={clsx(h.panel, h.panelHeat)} {...panel}>
        <HeatGrid boxed={false} alt={niftyFieldAlt} />
      </TabsContent>
      <TabsContent value="movers" forceMount className={clsx(h.panel, h.panelMovers)} {...panel}>
        <MoversBoard variant="hub" boxed={false} />
      </TabsContent>
      <TabsContent value="sectors" forceMount className={clsx(h.panel, h.panelSectors)} {...panel}>
        <SectorBars variant="full" boxed={false} />
      </TabsContent>
    </Tabs>
  );
}
