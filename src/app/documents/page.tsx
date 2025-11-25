import { deleteDocumentActionVoid, getDocumentsWithAllVersionsAction } from '@/domain/document/document.actions';
import { listTargetLanguages } from '@/domain/language/language.repository';
import { listSourceProjectsAction } from '@/domain/source-project/source-project.actions';
import { getCurrentUser } from '@/lib/session';
import { redirect } from 'next/navigation';
import DocumentsClient from './page.client';

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{
    sourceProject?: string;
    search?: string;
  }>;
}) {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login');
  }

  const params = await searchParams;

  // Fetch all documents with versions, target languages (excluding English), and source projects
  const documents = await getDocumentsWithAllVersionsAction();
  const languages = await listTargetLanguages();
  const sourceProjects = await listSourceProjectsAction();

  return (
    <DocumentsClient
      user={user}
      documents={documents}
      languages={languages}
      sourceProjects={sourceProjects}
      handleDeleteDocument={deleteDocumentActionVoid}
      initialFilters={{
        sourceProject: params.sourceProject,
        search: params.search,
      }}
    />
  );
}
