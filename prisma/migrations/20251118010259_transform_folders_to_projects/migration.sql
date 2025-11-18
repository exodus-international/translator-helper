-- CreateEnum
CREATE TYPE "ProjectRole" AS ENUM ('PROJECT_MANAGER', 'REVIEWER', 'EDITOR', 'TRANSLATOR');

-- CreateTable
CREATE TABLE "source_project" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "source_project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "translation_project" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sourceProjectId" TEXT NOT NULL,
    "languageId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "translation_project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_member" (
    "id" TEXT NOT NULL,
    "translationProjectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "ProjectRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_assignment" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "translationProjectId" TEXT NOT NULL,
    "userId" TEXT,
    "deadline" TIMESTAMP(3),
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_assignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "source_project_name_key" ON "source_project"("name");

-- CreateIndex
CREATE UNIQUE INDEX "translation_project_sourceProjectId_languageId_key" ON "translation_project"("sourceProjectId", "languageId");

-- CreateIndex
CREATE UNIQUE INDEX "project_member_translationProjectId_userId_key" ON "project_member"("translationProjectId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "document_assignment_documentId_translationProjectId_key" ON "document_assignment"("documentId", "translationProjectId");

-- AddForeignKey
ALTER TABLE "translation_project" ADD CONSTRAINT "translation_project_sourceProjectId_fkey" FOREIGN KEY ("sourceProjectId") REFERENCES "source_project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "translation_project" ADD CONSTRAINT "translation_project_languageId_fkey" FOREIGN KEY ("languageId") REFERENCES "language"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_member" ADD CONSTRAINT "project_member_translationProjectId_fkey" FOREIGN KEY ("translationProjectId") REFERENCES "translation_project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_member" ADD CONSTRAINT "project_member_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_assignment" ADD CONSTRAINT "document_assignment_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_assignment" ADD CONSTRAINT "document_assignment_translationProjectId_fkey" FOREIGN KEY ("translationProjectId") REFERENCES "translation_project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_assignment" ADD CONSTRAINT "document_assignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_assignment" ADD CONSTRAINT "document_assignment_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddColumn to document table
ALTER TABLE "document" ADD COLUMN "sourceProjectId" TEXT;

-- AddForeignKey
ALTER TABLE "document" ADD CONSTRAINT "document_sourceProjectId_fkey" FOREIGN KEY ("sourceProjectId") REFERENCES "source_project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
