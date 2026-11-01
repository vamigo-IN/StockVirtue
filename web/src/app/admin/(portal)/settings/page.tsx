import type { Metadata } from 'next';
import { NoAccess } from '@/components/portal/common';
import { can } from '@/portal/access';
import { requireMe } from '@/portal/server';
import { SettingsView } from './SettingsView';

export const metadata: Metadata = { title: 'Site settings' };

export default async function SettingsPage() {
  const me = await requireMe();
  if (!can(me, 'settings.read')) return <NoAccess permission="settings.read" />;
  return <SettingsView />;
}
