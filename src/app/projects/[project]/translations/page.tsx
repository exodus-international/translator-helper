import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/session';
import { listTranslationProjectsAction } from '@/domain/translation-project/translation-project.actions';
import { listTargetLanguages } from '@/domain/language/language.repository';
import TranslationsClient from './page.client';
import { resolveProject } from '../resolve-project';

export default async function TranslationsPage({ params }: { params: Promise<{ project: string }> }) {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login');
  }

  if (user.role !== 'ADMIN') {
    redirect('/dashboard');
  }

  const { project } = await params;
  const sourceProject = await resolveProject(project, '/translations');

  const translationProjects = await listTranslationProjectsAction({
    sourceProjectId: sourceProject.id,
  });
  const languages = await listTargetLanguages();

  return (
    <TranslationsClient sourceProject={sourceProject} translationProjects={translationProjects} languages={languages} />
  );
}
