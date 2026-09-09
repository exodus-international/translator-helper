'use server';

import { listTranslationProjectsAction } from '@/domain/translation-project/translation-project.actions';
import { listTargetLanguages } from '@/domain/language/language.repository';
import { resolveInitialLanguage } from '@/domain/language/resolve-initial-language';
import { getUserLanguages } from '@/domain/user-language/user-language.repository';
import { canAccessSourceProject } from '@/lib/permissions';
import { getCurrentUser } from '@/lib/session';
import { redirect } from 'next/navigation';
import ProjectDetailClient from './page.client';
import { resolveProject } from './resolve-project';

export default async function ProjectDetailPage({ params }: { params: Promise<{ project: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const { project } = await params;

  const sourceProject = await resolveProject(project);

  const hasAccess = await canAccessSourceProject(user, sourceProject.id);
  if (!hasAccess) redirect('/dashboard');

  const languages = await listTargetLanguages();
  const translationProjects = await listTranslationProjectsAction({ sourceProjectId: sourceProject.id });
  const userLanguages = await getUserLanguages(user.id);

  const initialLanguageId = resolveInitialLanguage({
    userLanguageIds: userLanguages.map((userLanguage) => userLanguage.languageId),
    projectLanguages: translationProjects.map((translationProject) => translationProject.language),
  });

  return (
    <ProjectDetailClient
      user={user}
      sourceProject={sourceProject}
      languages={languages}
      translationProjects={translationProjects}
      initialLanguageId={initialLanguageId}
    />
  );
}
