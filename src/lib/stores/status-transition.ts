import { create } from 'zustand';

/**
 * Which document versions have a status change in flight.
 *
 * `StatusDropdown` is mounted more than once for the same version -- the
 * editor's header carries one and the document panel another -- and each mount
 * has its own `disabled` expression. Local loading state therefore guards only
 * the control that was clicked: while one is mid-transition the other stays
 * live, and two concurrent status changes go out for the same version.
 *
 * Keying the in-flight set by version id makes the guard shared by every mount,
 * however many there are and wherever they live. It is deliberately not part of
 * the editor store: the dropdown is a general component and must keep working
 * outside `<EditorProvider>`.
 */
interface StatusTransitionState {
  pending: ReadonlySet<string>;
  /** Claims the version. False when a transition is already in flight for it. */
  begin: (versionId: string) => boolean;
  release: (versionId: string) => void;
}

export const useStatusTransitionStore = create<StatusTransitionState>((set, get) => ({
  pending: new Set<string>(),

  begin: (versionId) => {
    if (get().pending.has(versionId)) return false;
    set((state) => {
      const pending = new Set(state.pending);
      pending.add(versionId);
      return { pending };
    });
    return true;
  },

  release: (versionId) =>
    set((state) => {
      const pending = new Set(state.pending);
      pending.delete(versionId);
      return { pending };
    }),
}));

/** True while any mount is changing this version's status. */
export function useStatusTransitionPending(versionId: string): boolean {
  return useStatusTransitionStore((state) => state.pending.has(versionId));
}
