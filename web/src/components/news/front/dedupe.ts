/**
 * Visual de-duplication on the news front (spec §5.9.2). Pure: no React,
 * no clock, no 'server-only', so the design gallery and any check script
 * can run it.
 *
 * The front keeps one `seen` set per render: the ids of the stories it has
 * already shown as PICTURE units (a `splash`, a `feature`, or a `row` with
 * its image), in page order. A later section draws a story that is already
 * in the set as a `brief` without its image; when a section's FIRST story is
 * in the set, the whole section switches to list mode (rows without images,
 * then briefs). Counts and order never change: this is rendering only.
 * Breaking and Trending neither add to the set nor change.
 */

/** The set of story ids already drawn as pictures higher up the page. */
export interface Seen {
  has(id: string): boolean;
  /** Adds every id (a section's `pictures`, after it is laid out). */
  addAll(ids: Iterable<string>): void;
  /** The ids in the order they were added (the gallery prints them). */
  ids(): string[];
}

/** A fresh, empty `seen` set for one render of the front. */
export function createSeen(): Seen {
  const order: string[] = [];
  const set = new Set<string>();
  return {
    has: (id) => set.has(id),
    addAll(ids) {
      for (const id of ids) {
        if (!set.has(id)) {
          set.add(id);
          order.push(id);
        }
      }
    },
    ids: () => [...order],
  };
}

/** The story-unit variants that are picture units by themselves. */
const PICTURE_VARIANTS: ReadonlySet<string> = new Set(['splash', 'feature']);

/**
 * Whether one rendered unit counts as a picture (spec §5.9.2): every
 * `splash` and `feature`, and a `row` only while it shows its image.
 */
export function isPictureUnit(unit: {
  variant: string;
  hasImage: boolean;
}): boolean {
  if (PICTURE_VARIANTS.has(unit.variant)) return true;
  return unit.variant === 'row' && unit.hasImage;
}
