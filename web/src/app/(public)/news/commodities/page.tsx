import { CommoditiesHub } from '@/components/news/hubs/CommoditiesHub';
import { landingMetadata } from '@/components/news/hubs/metadata';

export const revalidate = 30;

export function generateMetadata() {
  return landingMetadata('commodities');
}

export default function Page() {
  return <CommoditiesHub />;
}
