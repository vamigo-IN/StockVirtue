'use client';

import { useEffect, useState } from 'react';
import {
  PageHeader,
  QueryError,
  RowsSkeleton,
} from '@/components/portal/common';
import { usePortalMe } from '@/components/portal/PortalShell';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { can } from '@/portal/access';
import { useSiteConfig } from '@/portal/queries';
import type { SiteConfigView } from '@/portal/types';
import { AdsTab } from './AdsTab';
import { AnalyticsTab } from './AnalyticsTab';
import { BrandingTab } from './BrandingTab';
import { PrivacyTab } from './PrivacyTab';
import { SearchTab } from './SearchTab';
import { SettingsView } from './SettingsView';

/**
 * Site settings, one tab per area. Each tab shows to anyone allowed to read
 * it and saves on its own; the API checks the permission again.
 */
export function SettingsTabs() {
  const me = usePortalMe();
  const read = can(me, 'settings.read');
  const tabs = [
    { key: 'general', label: 'General', show: read },
    { key: 'branding', label: 'Branding', show: read },
    {
      key: 'search',
      label: 'Search & indexing',
      show: read || can(me, 'seo.read'),
    },
    { key: 'analytics', label: 'Analytics', show: read },
    {
      key: 'ads',
      label: 'Advertising',
      show: read || can(me, 'ads.manage'),
    },
    {
      key: 'privacy',
      label: 'Privacy',
      show: read || can(me, 'privacy.manage'),
    },
  ].filter((t) => t.show);
  const [tab, setTab] = useState(tabs[0]?.key ?? 'general');
  const config = useSiteConfig(tabs.some((t) => t.key !== 'general'));

  // Open the tab named in the address (#search), e.g. from a bookmark.
  useEffect(() => {
    const wanted = window.location.hash.slice(1);
    if (tabs.some((t) => t.key === wanted)) setTab(wanted);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const withConfig = (render: (view: SiteConfigView) => React.ReactNode) =>
    config.error ? (
      <QueryError error={config.error} onRetry={() => void config.refetch()} />
    ) : config.data ? (
      render(config.data)
    ) : (
      <RowsSkeleton rows={6} />
    );

  return (
    <>
      <PageHeader
        title="Site settings"
        description="How stockvirtue.com looks, how search engines and AI tools see it, what it tracks, which ads it shows, and who answers for personal data."
      />
      <Tabs
        value={tab}
        onValueChange={(v) => {
          setTab(v);
          window.history.replaceState(null, '', `#${v}`);
        }}
      >
        <div className="-mx-1 overflow-x-auto px-1 pb-1">
          <TabsList>
            {tabs.map((t) => (
              <TabsTrigger key={t.key} value={t.key}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        {/* Kept mounted, so switching tabs never drops unsaved changes. */}
        {read && (
          <TabsContent
            value="general"
            forceMount
            className="mt-6 data-[state=inactive]:hidden"
          >
            <SettingsView embedded />
          </TabsContent>
        )}
        {read && (
          <TabsContent
            value="branding"
            forceMount
            className="mt-6 data-[state=inactive]:hidden"
          >
            {withConfig((view) => (
              <BrandingTab view={view} canEdit={can(me, 'settings.update')} />
            ))}
          </TabsContent>
        )}
        {tabs.some((t) => t.key === 'search') && (
          <TabsContent
            value="search"
            forceMount
            className="mt-6 data-[state=inactive]:hidden"
          >
            {withConfig((view) => (
              <SearchTab view={view} canEdit={can(me, 'seo.update')} />
            ))}
          </TabsContent>
        )}
        {read && (
          <TabsContent
            value="analytics"
            forceMount
            className="mt-6 data-[state=inactive]:hidden"
          >
            {withConfig((view) => (
              <AnalyticsTab view={view} canEdit={can(me, 'settings.update')} />
            ))}
          </TabsContent>
        )}
        {tabs.some((t) => t.key === 'ads') && (
          <TabsContent
            value="ads"
            forceMount
            className="mt-6 data-[state=inactive]:hidden"
          >
            {withConfig((view) => (
              <AdsTab view={view} canEdit={can(me, 'ads.manage')} />
            ))}
          </TabsContent>
        )}
        {tabs.some((t) => t.key === 'privacy') && (
          <TabsContent
            value="privacy"
            forceMount
            className="mt-6 data-[state=inactive]:hidden"
          >
            {withConfig((view) => (
              <PrivacyTab view={view} canEdit={can(me, 'privacy.manage')} />
            ))}
          </TabsContent>
        )}
      </Tabs>
    </>
  );
}
