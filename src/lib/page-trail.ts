import { create } from 'zustand';

export interface TrailCrumb {
  label: string;
  /** Where this crumb goes, when there is a page for it. */
  href?: string;
}

interface TrailState {
  trail: TrailCrumb[] | null;
  setTrail: (trail: TrailCrumb[] | null) => void;
}

/**
 * The trail a document editor publishes for the shell's topbar.
 *
 * The topbar builds its breadcrumb from the pathname, which knows the segments
 * but not their names: a document's real title and its language's readable name
 * only exist inside the page, under the editor that already has them. So the
 * editor publishes them here and the topbar prefers them, falling back to the
 * pathname's own crumbs for every other page in the app.
 */
export const useTrailStore = create<TrailState>((set) => ({
  trail: null,
  setTrail: (trail) => set({ trail }),
}));
