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

export default async function ProjectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ project: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const { project } = await params;

  const sourceProject = await resolveProject(project);

  const hasAccess = await canAccessSourceProject(user, sourceProject.id);
  if (!hasAccess) redirect('/dashboard');

  const languages = await listTargetLanguages();
  const translationProjects = await listTranslationProjectsAction({ sourceProjectId: sourceProject.id });
  const userLanguages = await getUserLanguages(user.id);

  // A link can name the language it is about -- the language overview's project
  // rows do. It only counts when the project is actually translated into it;
  // anything else falls back to the usual choice.
  const { lang } = await searchParams;
  const requested = lang
    ? translationProjects.find((translationProject) => translationProject.language.code === lang)
    : undefined;

  const initialLanguageId =
    requested?.languageId ??
    resolveInitialLanguage({
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
      languageFromUrl={!!requested}
    />
  );
}
