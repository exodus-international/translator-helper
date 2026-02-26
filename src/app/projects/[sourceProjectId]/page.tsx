'use server';

import { getSourceProjectAction } from '@/domain/source-project/source-project.actions';
import { listTranslationProjectsAction } from '@/domain/translation-project/translation-project.actions';
import { listTargetLanguages } from '@/domain/language/language.repository';
import { canAccessSourceProject } from '@/lib/permissions';
import { getCurrentUser } from '@/lib/session';
import { notFound, redirect } from 'next/navigation';
import ProjectDetailClient from './page.client';

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ sourceProjectId: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const { sourceProjectId } = await params;

  const hasAccess = await canAccessSourceProject(user, sourceProjectId);
  if (!hasAccess) redirect('/dashboard');

  const sourceProject = await getSourceProjectAction(sourceProjectId);
  if (!sourceProject) notFound();

  const languages = await listTargetLanguages();
  const translationProjects = await listTranslationProjectsAction({ sourceProjectId });

  return (
    <ProjectDetailClient
      user={user}
      sourceProject={sourceProject}
      languages={languages}
      translationProjects={translationProjects}
    />
  );
}
