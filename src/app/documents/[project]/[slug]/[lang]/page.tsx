import { getDocumentAssignmentByDocumentAndProject } from '@/domain/document-assignment/document-assignment.repository';
import { getDocumentVersionByDocumentAndLanguage } from '@/domain/document-version/document-version.repository';
import { getDocumentByProjectAndSlug } from '@/domain/document/document.repository';
import { getLanguageByCode } from '@/domain/language/language.repository';
import { getSuggestionsByDocumentVersion } from '@/domain/suggestion/suggestion.repository';
import { getTranslationProjectBySourceAndLanguage } from '@/domain/translation-project/translation-project.repository';
import { isDraftPhase } from '@/lib/document-status';
import { getCurrentUser } from '@/lib/session';
import { notFound, redirect } from 'next/navigation';
import ReviewClient from '../../../_editors/review.client';
import TranslateClient from '../../../_editors/translate.client';

/**
 * The one editor URL: /documents/{project}/{slug}/{lang}
 *
 * Which editor renders follows the version's status rather than the URL, so a
 * link shared while a document was being translated still opens correctly once
 * it has moved to review. That is the whole reason the verb is not in the path.
 */
export default async function DocumentEditorPage({
  params,
}: {
  params: Promise<{ project: string; slug: string; lang: string }>;
}) {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login');
  }

  const { project, slug, lang } = await params;

  const [document, language, englishLang] = await Promise.all([
    getDocumentByProjectAndSlug(project, slug),
    getLanguageByCode(lang),
    getLanguageByCode('en'),
  ]);

  if (!document || !language) {
    notFound();
  }

  if (!englishLang) {
    throw new Error('English language not found');
  }

  const sourceVersion = document.versions.find((v: { language: { code: string } }) => v.language.code === 'en');

  if (!sourceVersion) {
    throw new Error('Source English version not found');
  }

  // One version per document per language, so language alone identifies it.
  const targetVersion = await getDocumentVersionByDocumentAndLanguage(document.id, language.id);
  const targetLanguage = { code: language.code, name: language.name };
  const initialSuggestions = targetVersion ? await getSuggestionsByDocumentVersion(targetVersion.id) : [];

  if (targetVersion && !isDraftPhase(targetVersion.status)) {
    return (
      <ReviewClient
        document={document}
        sourceVersion={sourceVersion}
        targetVersion={targetVersion}
        targetLanguage={targetLanguage}
        user={user}
        initialSuggestions={initialSuggestions}
      />
    );
  }

  let translationProject = null;
  let assignment = null;
  if (document.sourceProject?.id) {
    translationProject = await getTranslationProjectBySourceAndLanguage(document.sourceProject.id, language.id);
    if (translationProject) {
      assignment = await getDocumentAssignmentByDocumentAndProject(document.id, translationProject.id);
    }
  }

  return (
    <TranslateClient
      document={document}
      sourceVersion={sourceVersion}
      targetVersion={targetVersion}
      targetLanguageId={language.id}
      targetLanguage={targetLanguage}
      translationProject={translationProject}
      assignment={assignment}
      user={user}
      initialSuggestions={initialSuggestions}
    />
  );
}
