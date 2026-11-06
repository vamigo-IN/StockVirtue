'use client';

import { useEffect, useState } from 'react';

/**
 * Where Radix overlays portal to (spec §4 rule 1): `#sv-public`, so a
 * popover, sheet or drawer inherits the public fonts and tokens. Every
 * public Radix `Portal` gets `container={usePortalContainer()}`.
 *
 * Null on the server, during hydration and on a component's first client
 * render; the element after mount. It is looked up in an effect, so nothing
 * touches `document` during render. Overlays only open after a reader acts,
 * long after mount, so they always find the container.
 */
export function usePortalContainer(): HTMLElement | null {
  const [container, setContainer] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setContainer(document.getElementById('sv-public'));
  }, []);
  return container;
}
