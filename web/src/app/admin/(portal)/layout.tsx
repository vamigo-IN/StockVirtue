import { PortalShell } from '@/components/portal/PortalShell';
import { requireMe } from '@/portal/server';

export const dynamic = 'force-dynamic';

/** Every page in here needs a live staff session (checked with the API). */
export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const me = await requireMe();
  return <PortalShell me={me}>{children}</PortalShell>;
}
