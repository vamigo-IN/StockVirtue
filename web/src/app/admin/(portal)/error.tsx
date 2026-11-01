'use client';

import { ServerCrash } from 'lucide-react';
import { EmptyState } from '@/components/portal/common';
import { Button } from '@/components/ui/button';

export default function PageError({ reset }: { reset: () => void }) {
  return (
    <div className="mx-auto max-w-md py-16">
      <EmptyState icon={ServerCrash} title="This page couldn't load">
        <p>The newsroom service didn&apos;t answer. Try again in a moment.</p>
        <Button className="mt-4" variant="outline" onClick={reset}>
          Try again
        </Button>
      </EmptyState>
    </div>
  );
}
