-- CreateIndex
CREATE INDEX "activity_log_action_userId_createdAt_idx" ON "activity_log"("action", "userId", "createdAt");

-- CreateIndex
CREATE INDEX "session_userId_updatedAt_idx" ON "session"("userId", "updatedAt");
