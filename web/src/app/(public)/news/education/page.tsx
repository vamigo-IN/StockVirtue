import { LearnHub } from '@/components/news/hubs/LearnHub';
import { landingMetadata } from '@/components/news/hubs/metadata';

export const revalidate = 30;

export function generateMetadata() {
  return landingMetadata('education');
}

export default function Page() {
  return <LearnHub />;
}
