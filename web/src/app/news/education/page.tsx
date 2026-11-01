import { LandingPage, landingMetadata } from '@/components/news/LandingPage';

export const revalidate = 30;

export function generateMetadata() {
  return landingMetadata('education');
}

export default function Page() {
  return <LandingPage slug="education" />;
}
