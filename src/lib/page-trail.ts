import { create } from 'zustand';

export interface TrailCrumb {
  label: string;
  /** Where this crumb goes, when there is a page for it. */
  href?: string;
}

interface TrailState {
  trail: TrailCrumb[] | null;
  /** Which publisher the current trail belongs to. */
  owner: number | null;
  /**
   * Publishes a trail and returns the release for it. The release clears the
   * slot only while this publisher still owns it.
   */
  publish: (trail: TrailCrumb[]) => () => void;
}

let nextOwner = 0;

/**
 * The trail a document editor publishes for the shell's topbar.
 *
 * The topbar builds its breadcrumb from the pathname, which knows the segments
 * but not their names: a document's real title and its language's readable name
 * only exist inside the page, under the editor that already has them. So the
 * editor publishes them here and the topbar prefers them, falling back to the
 * pathname's own crumbs for every other page in the app.
 */
export const useTrailStore = create<TrailState>((set, get) => ({
  trail: null,
  owner: null,

  publish: (trail) => {
    const owner = ++nextOwner;
    set({ trail, owner });

    // One slot, and mount ordering is not ours to choose: navigating quickly
    // from one document to another runs the new editor's effect before the old
    // one's cleanup, so an unconditional clear would wipe the trail the page
    // now on screen had just published and collapse its breadcrumb to the
    // pathname's own crumbs. Only the publisher still holding the slot may
    // clear it.
    return () => {
      if (get().owner !== owner) return;
      set({ trail: null, owner: null });
    };
  },
}));
