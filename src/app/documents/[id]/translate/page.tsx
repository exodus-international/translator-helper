import { getDocumentAssignmentByDocumentAndProject } from '@/domain/document-assignment/document-assignment.repository';
import {
  getDocumentVersionByDocumentAndLanguage,
  getDocumentVersionById,
} from '@/domain/document-version/document-version.repository';
import { getDocumentById } from '@/domain/document/document.repository';
import { getLanguageByCode } from '@/domain/language/language.repository';
import { getSuggestionsByDocumentVersion } from '@/domain/suggestion/suggestion.repository';
import { getTranslationProjectBySourceAndLanguage } from '@/domain/translation-project/translation-project.repository';
import { getCurrentUser } from '@/lib/session';
import { notFound, redirect } from 'next/navigation';
import TranslateClient from './page.client';

export default async function TranslatePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ lang?: string; version?: string }>;
}) {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login');
  }

  const { id } = await params;
  const { lang, version: versionId } = await searchParams;

  const document = await getDocumentById(id);

  if (!document) {
    notFound();
  }

  // Get the English (source) version
  const englishLang = await getLanguageByCode('en');
  if (!englishLang) {
    throw new Error('English language not found');
  }

  const sourceVersion = await getDocumentVersionByDocumentAndLanguage(id, englishLang.id);

  if (!sourceVersion) {
    throw new Error('Source English version not found');
  }

  // Get the target language version (if it exists)
  let targetVersion = null;
  if (versionId) {
    targetVersion = await getDocumentVersionById(versionId);
  } else if (lang) {
    // Try to find existing version (including drafts)
    targetVersion = await getDocumentVersionByDocumentAndLanguage(id, lang);
  }

  // Get translation project and assignment info if we have a target language
  let translationProject = null;
  let assignment = null;
  if (lang && document.sourceProject?.id) {
    translationProject = await getTranslationProjectBySourceAndLanguage(document.sourceProject.id, lang);
    if (translationProject) {
      assignment = await getDocumentAssignmentByDocumentAndProject(id, translationProject.id);
    }
  }

  // Fetch suggestions for the target version
  const initialSuggestions = targetVersion
    ? await getSuggestionsByDocumentVersion(targetVersion.id)
    : [];

  return (
    <TranslateClient
      document={document}
      sourceVersion={sourceVersion}
      targetVersion={targetVersion}
      targetLanguageId={lang || ''}
      translationProject={translationProject}
      assignment={assignment}
      user={user}
      initialSuggestions={initialSuggestions}
    />
  );
}
