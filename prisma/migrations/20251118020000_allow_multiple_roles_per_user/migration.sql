-- DropIndex
DROP INDEX IF EXISTS "project_member_translationProjectId_userId_key";
-- CreateIndex
CREATE UNIQUE INDEX "project_member_translationProjectId_userId_role_key" ON "project_member"("translationProjectId", "userId", "role");