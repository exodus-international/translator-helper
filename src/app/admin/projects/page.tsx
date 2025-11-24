import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/session';
import { canManageFolders } from '@/lib/permissions';
import { listSourceProjectsAction } from '@/domain/source-project/source-project.actions';
import ProjectsClient from './page.client';

export default async function ProjectsPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login');
  }

  if (!canManageFolders(user)) {
    redirect('/dashboard');
  }

  const sourceProjects = await listSourceProjectsAction({ includeComplete: true });

  return <ProjectsClient sourceProjects={sourceProjects} />;
}
