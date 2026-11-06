/**
 * The skip link (spec §2.3, §4.14): the first thing in every page's header,
 * visually hidden until it takes focus, then a 44 px ink pill at the top
 * left (z 80) with white text (`.sv-skip`, public.css). It targets
 * `<main id="main" tabIndex={-1}>`, which every family layout renders, so
 * following it moves focus to the content.
 *
 * Text (spec §9.6): "Skip to the stories" on news pages, "Skip to content"
 * everywhere else. A plain <a> on purpose: the browser's own fragment
 * navigation moves focus, and no client code is needed (the server-only
 * root 404 renders it too). Server-safe.
 */
export function SkipLink({
  label = 'Skip to content',
}: {
  label?: 'Skip to content' | 'Skip to the stories';
}) {
  return (
    <a className="sv-skip" href="#main">
      {label}
    </a>
  );
}
