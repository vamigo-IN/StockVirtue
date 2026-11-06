import { MarketsHub } from '@/components/news/hubs/MarketsHub';
import { landingMetadata } from '@/components/news/hubs/metadata';

export const revalidate = 30;

export function generateMetadata() {
  return landingMetadata('markets');
}

export default function Page() {
  return <MarketsHub />;
}
