import type { Metadata } from 'next';
import { NoAccess } from '@/components/portal/common';
import { can } from '@/portal/access';
import { requireMe } from '@/portal/server';
import { SettingsTabs } from './SettingsTabs';

export const metadata: Metadata = { title: 'Site settings' };

export default async function SettingsPage() {
  const me = await requireMe();
  if (
    !can(me, 'settings.read') &&
    !can(me, 'seo.read') &&
    !can(me, 'ads.manage') &&
    !can(me, 'privacy.manage')
  ) {
    return <NoAccess permission="settings.read" />;
  }
  return <SettingsTabs />;
}
