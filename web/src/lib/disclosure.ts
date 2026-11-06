/**
 * "Closed on phones, open from 768 px" (spec §4.11 PhoneDisclosure). Every
 * <details data-pd> is closed in the server HTML; this inline script, placed
 * after the page content inside #sv-public (src/app/(public)/layout.tsx),
 * opens them at >= 768 px before the first paint, so the state is a real
 * `open` attribute (screen readers hear it, desktop readers can still close
 * it). After client navigations DisclosureInit (M0.4, with PhoneDisclosure)
 * repeats the same in a layout effect. The <details> carry
 * suppressHydrationWarning for the attribute this adds.
 */
export const DISCLOSURE_SCRIPT = `(function(){try{if(!window.matchMedia('(min-width: 768px)').matches)return;var d=document.querySelectorAll('details[data-pd]');for(var i=0;i<d.length;i++)d[i].open=true}catch(_){}})();`;

/**
 * Opens every PhoneDisclosure (`details[data-pd]`) under `root` when the
 * window is at least 768 px wide; does nothing on phones. The same job as
 * DISCLOSURE_SCRIPT, for code that runs later. Browser only: call it from
 * an effect or a handler. A client component that mounts its
 * PhoneDisclosure after hydration (a list that renders when its data
 * arrives) calls it from a layout effect on its own root.
 *
 * It lives here, not in DisclosureInit.tsx, on purpose: only the (public)
 * layout may import that client module. Next merges the client-reference
 * manifests of entries whose paths differ only by route groups (the
 * (public), (home) and (site) layouts and the home page are one group,
 * and so are the news layout and the /news front), and a client module
 * that a page also imports is then mapped to that page's chunks on every
 * other page: DisclosureInit pulled the home page's JS (about 40 KB gzip)
 * into every site page while PhoneDisclosure re-exported it.
 */
export function openWideDisclosures(root: ParentNode = document): void {
  try {
    if (!window.matchMedia('(min-width: 768px)').matches) return;
    root.querySelectorAll<HTMLDetailsElement>('details[data-pd]').forEach((d) => {
      d.open = true;
    });
  } catch {
    // matchMedia or querySelectorAll missing: the disclosures stay closed
    // and keep working.
  }
}
