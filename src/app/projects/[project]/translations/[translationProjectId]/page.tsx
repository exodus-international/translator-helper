import { listDocumentAssignmentsAction } from '@/domain/document-assignment/document-assignment.actions';
import { listDocumentsAction } from '@/domain/document/document.actions';
import { listProjectMembersAction } from '@/domain/project-member/project-member.actions';
import { getTranslationProjectAction } from '@/domain/translation-project/translation-project.actions';
import { listUsersAction } from '@/domain/user/user.actions';
import { authorize } from '@/lib/authorize';
import { notFound, redirect } from 'next/navigation';
import TranslationProjectClient from './page.client';
import { resolveProject } from '../../resolve-project';

export default async function TranslationProjectPage({
  params,
}: {
  params: Promise<{ project: string; translationProjectId: string }>;
}) {
  const { project, translationProjectId } = await params;
  const sourceProject = await resolveProject(project, `/translations/${translationProjectId}`);
  const translationProject = await getTranslationProjectAction(translationProjectId);

  if (!translationProject || translationProject.sourceProjectId !== sourceProject.id) {
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
    listDocumentsAction({ sourceProjectId: sourceProject.id }),
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
