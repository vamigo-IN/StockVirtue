import type { Metadata } from 'next';
import { SecurityView } from './SecurityView';

export const metadata: Metadata = { title: 'Security' };

/** Everyone sees their own sessions; security.manage also sees everyone's. */
export default function SecurityPage() {
  return <SecurityView />;
}
