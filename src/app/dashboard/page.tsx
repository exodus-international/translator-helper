'use server';

import { getAssignedDocumentsForUserAction } from '@/domain/document-assignment/document-assignment.actions';
import {
  getApprovedVersionsAction,
  getVersionsForReviewByUserAction,
  getVersionsTranslatingByUserAction,
} from '@/domain/document-version/document-version.actions';
import { getSourceProjectsForUserAction } from '@/domain/source-project/source-project.actions';
import { getUserLanguagesCountAction } from '@/domain/user-language/user-language.actions';
import { getCurrentUser } from '@/lib/session';
import { redirect } from 'next/navigation';
import DashboardClient from './page.client';

export default async function DashboardPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login');
  }

  const languagesCount = await getUserLanguagesCountAction();
  if (languagesCount === 0) {
    redirect('/onboarding/languages');
  }

  const [projects, assignments, approvedVersions, reviewAssignments, translatingVersions] = await Promise.all([
    getSourceProjectsForUserAction(),
    getAssignedDocumentsForUserAction(),
    getApprovedVersionsAction(),
    getVersionsForReviewByUserAction(),
    getVersionsTranslatingByUserAction(),
  ]);

  return (
    <DashboardClient
      user={user}
      projects={projects}
      assignments={assignments}
      approvedVersions={approvedVersions}
      reviewAssignments={reviewAssignments}
      translatingVersions={translatingVersions}
    />
  );
}
