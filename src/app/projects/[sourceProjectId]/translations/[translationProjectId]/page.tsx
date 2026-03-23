import { listDocumentAssignmentsAction } from '@/domain/document-assignment/document-assignment.actions';
import { listDocumentsAction } from '@/domain/document/document.actions';
import { listProjectMembersAction } from '@/domain/project-member/project-member.actions';
import { getTranslationProjectAction } from '@/domain/translation-project/translation-project.actions';
import { listUsersAction } from '@/domain/user/user.actions';
import { authorize } from '@/lib/authorize';
import { notFound, redirect } from 'next/navigation';
import TranslationProjectClient from './page.client';

export default async function TranslationProjectPage({
  params,
}: {
  params: Promise<{ sourceProjectId: string; translationProjectId: string }>;
}) {
  const { sourceProjectId, translationProjectId } = await params;
  const translationProject = await getTranslationProjectAction(translationProjectId);

  if (!translationProject) {
    notFound();
  }

  // Check if user can manage this project (must be PM or ADMIN)
  try {
    await authorize({ project: translationProjectId, role: 'manager' });
  } catch {
    redirect('/dashboard');
  }

  const [members, assignments, documents, users] = await Promise.all([
    listProjectMembersAction(translationProjectId),
    listDocumentAssignmentsAction({ translationProjectId }),
    listDocumentsAction({ sourceProjectId: sourceProjectId }),
    listUsersAction(),
  ]);

  return (
    <TranslationProjectClient
      translationProject={translationProject}
      members={members}
      assignments={assignments}
      documents={documents}
      users={users}
    />
  );
}
