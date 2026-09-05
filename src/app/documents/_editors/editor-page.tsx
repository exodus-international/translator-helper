import { getTranscript } from '@/domain/audio/audio.service';
import { getDocumentVersionByDocumentAndLanguage } from '@/domain/document-version/document-version.repository';
import { getSuggestionsByDocumentVersion } from '@/domain/suggestion/suggestion.repository';
import { getTranslationProjectBySourceAndLanguage } from '@/domain/translation-project/translation-project.repository';
import { isDraftPhase } from '@/lib/document-status';
import { SessionUser } from '@/lib/session';
import ReviewClient from './review.client';
import TranslateClient from './translate.client';

/**
 * Renders whichever editor the version's status calls for.
 *
 * Shared because two routes reach it: the canonical
 * /documents/{project}/{slug}/{lang}, and the legacy id-based route for a
 * document whose project has been deleted — that document has no canonical URL
 * to redirect to, and must still be openable.
 */
export async function DocumentEditorPage({
  document,
  language,
  user,
}: {
  // Prisma payloads here are wide and already untyped at the client boundary.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  document: any;
  language: { id: string; code: string; name: string };
  user: SessionUser;
}) {
  const sourceVersion = document.versions.find((v: { language: { code: string } }) => v.language.code === 'en');

  if (!sourceVersion) {
    throw new Error('Source English version not found');
  }

  // One version per document per language, so the language alone identifies it.
  const targetVersion = await getDocumentVersionByDocumentAndLanguage(document.id, language.id);
  const targetLanguage = { code: language.code, name: language.name };
  const initialSuggestions = targetVersion ? await getSuggestionsByDocumentVersion(targetVersion.id) : [];

  const translationProject = document.sourceProject?.id
    ? await getTranslationProjectBySourceAndLanguage(document.sourceProject.id, language.id)
    : null;

  // The Audio text tab exists only where audio does. getTranscript answers null
  // for a document whose language has no voice or whose project has the type
  // turned off, which is the same check generation makes.
  const audioTextVersionId =
    targetVersion && (await getTranscript(targetVersion.id)) ? targetVersion.id : null;

  if (targetVersion && !isDraftPhase(targetVersion.status)) {
    return (
      <ReviewClient
        document={document}
        sourceVersion={sourceVersion}
        targetVersion={targetVersion}
        targetLanguage={targetLanguage}
        translationProjectId={translationProject?.id ?? null}
        user={user}
        audioTextVersionId={audioTextVersionId}
        initialSuggestions={initialSuggestions}
      />
    );
  }

  return (
    <TranslateClient
      document={document}
      sourceVersion={sourceVersion}
      targetVersion={targetVersion}
      targetLanguageId={language.id}
      targetLanguage={targetLanguage}
      translationProject={translationProject}
      user={user}
      initialSuggestions={initialSuggestions}
    />
  );
}
