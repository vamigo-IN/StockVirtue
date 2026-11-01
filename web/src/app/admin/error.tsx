'use client';

import { ServerCrash } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * The portal couldn't load at all, typically because the newsroom API is
 * unreachable. Shown without the portal chrome, which needs the API too.
 */
export default function PortalError({ reset }: { reset: () => void }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <div className="max-w-sm text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-muted">
          <ServerCrash className="size-6 text-muted-foreground" aria-hidden />
        </span>
        <h1 className="mt-4 text-xl font-semibold">
          The newsroom isn&apos;t responding
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          We couldn&apos;t reach the newsroom service. It may be restarting; try
          again in a minute.
        </p>
        <Button className="mt-5" onClick={reset}>
          Try again
        </Button>
      </div>
    </div>
  );
}
