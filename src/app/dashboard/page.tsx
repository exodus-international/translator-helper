'use server';

import { AnnouncementBanner } from '@/components/announcement-banner';
import { AnnouncementModal } from '@/components/announcement-modal';
import { getVisibleAnnouncementsAction } from '@/domain/announcement/announcement.actions';
import { getAssignedDocumentsForUserAction } from '@/domain/document-assignment/document-assignment.actions';
import {
  getApprovedVersionsAction,
  getVersionsForReviewByUserAction,
  getVersionsTranslatingByUserAction,
} from '@/domain/document-version/document-version.actions';
import { getSourceProjectsForUserAction } from '@/domain/source-project/source-project.actions';
import { isUserOnboardedAction } from '@/domain/user/user.actions';
import { getCurrentUser } from '@/lib/session';
import { redirect } from 'next/navigation';
import DashboardClient from './page.client';

export default async function DashboardPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login');
  }

  const onboarded = await isUserOnboardedAction();
  if (!onboarded) {
    redirect('/onboarding/profile');
  }

  const [projects, assignments, approvedVersions, reviewAssignments, translatingVersions, announcements] =
    await Promise.all([
      getSourceProjectsForUserAction(),
      getAssignedDocumentsForUserAction(),
      getApprovedVersionsAction(),
      getVersionsForReviewByUserAction(),
      getVersionsTranslatingByUserAction(),
      getVisibleAnnouncementsAction(),
    ]);

  return (
    <>
      {announcements.banner && <AnnouncementBanner announcement={announcements.banner} />}
      {announcements.modal && <AnnouncementModal announcement={announcements.modal} />}
      <DashboardClient
        user={user}
        projects={projects}
        assignments={assignments}
        approvedVersions={approvedVersions}
        reviewAssignments={reviewAssignments}
        translatingVersions={translatingVersions}
      />
    </>
  );
}
