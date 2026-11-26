-- Deploys commit straight to the content repository's deploy branch and are
-- recorded as deployments. Additive only: github_commit stays, unread, until a
-- later release drops it, so the previous release keeps working while both run.

-- CreateEnum
CREATE TYPE "DeploymentStatus" AS ENUM ('QUEUED', 'PUBLISHING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "DeploymentTrigger" AS ENUM ('MANUAL', 'REDEPLOY', 'RETRY', 'AUTO');

-- CreateEnum
CREATE TYPE "DeploymentItemOutcome" AS ENUM ('PENDING', 'PUBLISHED', 'UNCHANGED', 'NOT_PUBLISHED', 'SKIPPED', 'FAILED');

-- AlterTable
ALTER TABLE "translation_project" ADD COLUMN     "autoDeploy" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "deployment" (
    "id" TEXT NOT NULL,
    "status" "DeploymentStatus" NOT NULL DEFAULT 'QUEUED',
    "trigger" "DeploymentTrigger" NOT NULL DEFAULT 'MANUAL',
    "requestedById" TEXT,
    "sourceProjectId" TEXT,
    "languageId" TEXT,
    "retryOfId" TEXT,
    "branch" TEXT,
    "commitSha" TEXT,
    "commitUrl" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "deployment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deployment_item" (
    "id" TEXT NOT NULL,
    "deploymentId" TEXT NOT NULL,
    "documentVersionId" TEXT NOT NULL,
    "outcome" "DeploymentItemOutcome" NOT NULL DEFAULT 'PENDING',
    "filePath" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deployment_item_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "deployment_createdAt_idx" ON "deployment"("createdAt");

-- CreateIndex
CREATE INDEX "deployment_status_idx" ON "deployment"("status");

-- CreateIndex
CREATE INDEX "deployment_languageId_createdAt_idx" ON "deployment"("languageId", "createdAt");

-- CreateIndex
CREATE INDEX "deployment_sourceProjectId_languageId_createdAt_idx" ON "deployment"("sourceProjectId", "languageId", "createdAt");

-- CreateIndex
CREATE INDEX "deployment_item_documentVersionId_createdAt_idx" ON "deployment_item"("documentVersionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "deployment_item_deploymentId_documentVersionId_key" ON "deployment_item"("deploymentId", "documentVersionId");

-- AddForeignKey
ALTER TABLE "deployment" ADD CONSTRAINT "deployment_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deployment" ADD CONSTRAINT "deployment_sourceProjectId_fkey" FOREIGN KEY ("sourceProjectId") REFERENCES "source_project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deployment" ADD CONSTRAINT "deployment_languageId_fkey" FOREIGN KEY ("languageId") REFERENCES "language"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deployment" ADD CONSTRAINT "deployment_retryOfId_fkey" FOREIGN KEY ("retryOfId") REFERENCES "deployment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deployment_item" ADD CONSTRAINT "deployment_item_deploymentId_fkey" FOREIGN KEY ("deploymentId") REFERENCES "deployment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deployment_item" ADD CONSTRAINT "deployment_item_documentVersionId_fkey" FOREIGN KEY ("documentVersionId") REFERENCES "document_version"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Carry the pull-request era's history over, one deployment per recorded
-- commit, so a document's deploy history does not start empty. The ids are
-- reused: each row becomes exactly one deployment and one item. Who deployed
-- was never recorded, so requestedById stays null.
--
-- Only a merged pull request put the file on the branch. A row with no error
-- whose pull request was left open or closed unmerged never got there, so it
-- comes over as failed, with Retry offered, rather than as published.
INSERT INTO "deployment" ("id", "status", "trigger", "sourceProjectId", "languageId", "branch", "commitSha", "commitUrl", "error", "createdAt", "startedAt", "finishedAt")
SELECT gc."id",
       CASE WHEN gc."errorMessage" IS NULL AND gc."prStatus" = 'MERGED' THEN 'SUCCEEDED'::"DeploymentStatus" ELSE 'FAILED'::"DeploymentStatus" END,
       'MANUAL'::"DeploymentTrigger",
       d."sourceProjectId",
       dv."languageId",
       gc."branchName",
       NULLIF(gc."commitSha", ''),
       gc."prUrl",
       COALESCE(gc."errorMessage", CASE WHEN gc."prStatus" IS DISTINCT FROM 'MERGED' THEN 'The pull request was never merged, so this may not have reached the branch. Retry to deploy it.' END),
       gc."createdAt",
       gc."createdAt",
       gc."createdAt"
FROM "github_commit" gc
JOIN "document_version" dv ON dv."id" = gc."documentVersionId"
JOIN "document" d ON d."id" = dv."documentId";

INSERT INTO "deployment_item" ("id", "deploymentId", "documentVersionId", "outcome", "filePath", "error", "createdAt")
SELECT gc."id",
       gc."id",
       gc."documentVersionId",
       CASE WHEN gc."errorMessage" IS NULL AND gc."prStatus" = 'MERGED' THEN 'PUBLISHED'::"DeploymentItemOutcome" ELSE 'FAILED'::"DeploymentItemOutcome" END,
       gc."filePath",
       COALESCE(gc."errorMessage", CASE WHEN gc."prStatus" IS DISTINCT FROM 'MERGED' THEN 'The pull request was never merged, so this may not have reached the branch. Retry to deploy it.' END),
       gc."createdAt"
FROM "github_commit" gc;
