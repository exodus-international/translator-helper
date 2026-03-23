import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/session';
import { listSourceProjectsAction } from '@/domain/source-project/source-project.actions';
import ProjectsClient from './page.client';

export default async function ProjectsPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login');
  }

  if (user.role !== 'ADMIN') {
    redirect('/dashboard');
  }

  const sourceProjects = await listSourceProjectsAction({ includeComplete: true });

  return <ProjectsClient sourceProjects={sourceProjects} />;
}
