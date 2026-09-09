-- Performance audit (2026-09-03): index the columns the hot queries filter
-- and order by. Invisible at dev size (Postgres seq-scans dozens of rows
-- regardless); decisive at production size on document_version, the largest
-- table and the one holding the TEXT content column.

-- CreateIndex
CREATE INDEX "document_version_userId_idx" ON "document_version"("userId");

-- CreateIndex
CREATE INDEX "document_version_reviewerId_idx" ON "document_version"("reviewerId");

-- CreateIndex
CREATE INDEX "document_version_languageId_idx" ON "document_version"("languageId");

-- CreateIndex
CREATE INDEX "document_version_status_idx" ON "document_version"("status");

-- CreateIndex
CREATE INDEX "document_updatedAt_idx" ON "document"("updatedAt");

-- CreateIndex
CREATE INDEX "suggestion_documentVersionId_status_idx" ON "suggestion"("documentVersionId", "status");

-- CreateIndex
CREATE INDEX "comment_documentVersionId_idx" ON "comment"("documentVersionId");

-- CreateIndex
CREATE INDEX "github_commit_documentVersionId_idx" ON "github_commit"("documentVersionId");

-- CreateIndex
CREATE INDEX "account_userId_idx" ON "account"("userId");

-- CreateIndex
CREATE INDEX "translation_project_languageId_idx" ON "translation_project"("languageId");
