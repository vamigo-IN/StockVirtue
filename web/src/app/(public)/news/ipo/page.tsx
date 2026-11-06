import { IpoHub } from '@/components/news/hubs/IpoHub';
import { landingMetadata } from '@/components/news/hubs/metadata';

export const revalidate = 30;

export function generateMetadata() {
  return landingMetadata('ipo');
}

export default function Page() {
  return <IpoHub />;
}
