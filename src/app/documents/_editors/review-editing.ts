import { DocumentStatus, ProjectRole } from '@/generated/prisma/enums';

/**
 * How a review edits the text in place. `scripture`: only through the
 * Scripture check, as on every project that does not use AI translation.
 * `direct`: an Edit button too, for reviewers on a project that does.
 * `none`: a translator on such a project, who reads the review; feedback
 * there is a reviewer's, as on every project.
 */
export type ReviewEditing = 'scripture' | 'direct' | 'none';

/** The roles that edit a drafted text in review: the server's `reviewer` rule and up. */
const EDITS_IN_REVIEW: readonly ProjectRole[] = [ProjectRole.REVIEWER, ProjectRole.EDITOR, ProjectRole.PROJECT_MANAGER];

/**
 * Which review editing someone gets on a language. The server enforces the
 * same rule (assertCanEditDocumentVersionContent with directEdit), so this
 * only decides what the screen offers.
 */
export function reviewEditingFor(viewer: {
  autoTranslate: boolean;
  isAdmin: boolean;
  role?: ProjectRole | null;
}): ReviewEditing {
  if (!viewer.autoTranslate) return 'scripture';
  if (viewer.isAdmin) return 'direct';
  return viewer.role && EDITS_IN_REVIEW.includes(viewer.role) ? 'direct' : 'none';
}

/** What the review screen offers for a version: editing at all, and the Edit button. */
export function reviewEditControls(status: DocumentStatus | null | undefined, reviewEditing: ReviewEditing) {
  const inReview = status === DocumentStatus.PENDING_REVIEW;
  return {
    canEdit: inReview && reviewEditing !== 'none',
    showEditButton: inReview && reviewEditing === 'direct',
  };
}
