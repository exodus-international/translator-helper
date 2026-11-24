import { authorize } from '@/lib/authorize';
import type { SessionUser } from '@/lib/session';
import { DocumentStatus, Role } from '@/generated/prisma/enums';
import { isDraftPhase } from '@/lib/document-status';
import { getDocumentById } from '../document/document.repository';
import { getLanguageById } from '../language/language.repository';
import { getTranslationProjectBySourceAndLanguage } from '../translation-project/translation-project.repository';
import { getDocumentVersionById } from './document-version.repository';

/**
 * Statuses whose text has passed review. Neither editor lets anyone change a
 * translation in them: moving the version back to PENDING_REVIEW is how
 * approved text changes, so the edit is reviewed again before the next deploy.
 */
const REVIEWED_STATUSES: readonly DocumentStatus[] = [DocumentStatus.APPROVED, DocumentStatus.DEPLOYED];

export function isReviewedStatus(status: DocumentStatus): boolean {
  return REVIEWED_STATUSES.includes(status);
}

type Authorize = typeof authorize;

interface PermissionVersion {
  id: string;
  documentId: string;
  languageId: string;
  status: DocumentStatus;
}

export interface VersionPermissionDeps<Version extends PermissionVersion = PermissionVersion> {
  getVersion: (id: string) => Promise<Version | null>;
  getLanguage: (id: string) => Promise<{ code: string } | null>;
  getDocument: (id: string) => Promise<{ sourceProject?: { id: string } | null } | null>;
  getTranslationProject: (sourceProjectId: string, languageId: string) => Promise<{ id: string } | null>;
  authorize: (permission: Parameters<Authorize>[0]) => Promise<unknown>;
}

export function createVersionPermissions<Version extends PermissionVersion>(deps: VersionPermissionDeps<Version>) {
  /**
   * The one rule for "may this user work on this document version": source
   * (English) versions are admin-only; a translation version needs a
   * translator's role (or higher) in its language, through its translation
   * project when there is one. Being the version's last editor grants nothing
   * on its own, so someone removed from a language loses access with it.
   * Editing the text, deleting and the audio actions all start from it.
   */
  async function assertCanEditDocumentVersion(versionId: string, user: SessionUser) {
    const version = await deps.getVersion(versionId);
    if (!version) throw new Error('Document version not found');

    const language = await deps.getLanguage(version.languageId);
    if (!language) throw new Error('Language not found');

    const isSourceEnglish = language.code === 'en';
    if (isSourceEnglish) {
      if (user.role !== Role.ADMIN) {
        throw new Error('Forbidden: Only deployers can edit source (English) document versions');
      }
      return { version, language, isSourceEnglish };
    }

    const document = await deps.getDocument(version.documentId);
    if (!document) throw new Error('Document not found');
    if (!document.sourceProject?.id) {
      throw new Error(
        'This document is not associated with a source project. Please assign a source project to the document before editing translations.',
      );
    }

    const translationProject = await deps.getTranslationProject(document.sourceProject.id, version.languageId);
    if (translationProject) {
      await deps.authorize({ project: translationProject.id, role: 'translator' });
    } else {
      // No project row yet: a language assignment carries the same role on
      // every project in the language, so ask it directly.
      await deps.authorize({ language: version.languageId, role: 'translator' });
    }

    return { version, language, isSourceEnglish };
  }

  /**
   * Changing a translation's text. On top of the membership rule, the text is
   * frozen once it has passed review (APPROVED or DEPLOYED) for everyone but an
   * administrator: the reviewer edits during PENDING_REVIEW, and later changes
   * go back through review, so a deploy never publishes unreviewed text.
   */
  async function assertCanEditDocumentVersionContent(versionId: string, user: SessionUser) {
    const result = await assertCanEditDocumentVersion(versionId, user);
    if (!result.isSourceEnglish && user.role !== Role.ADMIN && isReviewedStatus(result.version.status)) {
      throw new Error('This version has been approved. Move it back to review before editing it.');
    }
    return result;
  }

  /**
   * Deleting a version. A draft (PENDING_TRANSLATION or IN_PROGRESS) can be
   * deleted by anyone who may edit it; once it is in review or later, only the
   * language's manager or an administrator may delete it.
   */
  async function assertCanDeleteDocumentVersion(versionId: string, user: SessionUser) {
    const result = await assertCanEditDocumentVersion(versionId, user);
    if (!result.isSourceEnglish && !isDraftPhase(result.version.status)) {
      await deps.authorize({ language: result.version.languageId, role: 'manager' });
    }
    return result;
  }

  return { assertCanEditDocumentVersion, assertCanEditDocumentVersionContent, assertCanDeleteDocumentVersion };
}

const permissions = createVersionPermissions({
  getVersion: getDocumentVersionById,
  getLanguage: getLanguageById,
  getDocument: getDocumentById,
  getTranslationProject: getTranslationProjectBySourceAndLanguage,
  authorize,
});

export const { assertCanEditDocumentVersion, assertCanEditDocumentVersionContent, assertCanDeleteDocumentVersion } =
  permissions;
