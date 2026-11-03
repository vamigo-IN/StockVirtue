'use client';

import { openConsentSettings } from '@/lib/consent';

/** "Cookie settings" in the footers: changing a choice is as easy as making it. */
export function CookieSettingsButton({ className }: { className?: string }) {
  return (
    <button
      type="button"
      className={className}
      onClick={openConsentSettings}
      style={{
        background: 'none',
        border: 0,
        padding: 0,
        font: 'inherit',
        // A caller's class sets the colour; otherwise follow the text around it.
        color: className ? undefined : 'inherit',
        cursor: 'pointer',
        textAlign: 'left',
      }}
    >
      Cookie settings
    </button>
  );
}
