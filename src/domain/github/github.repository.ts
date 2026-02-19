import prisma from '@/lib/db';
import { GitHubPRStatus } from '@prisma/client';

export async function createGitHubCommit(data: {
  documentVersionId: string;
  commitSha: string;
  branchName: string;
  filePath: string;
  prNumber?: number;
  prUrl?: string;
  prStatus?: GitHubPRStatus;
  errorMessage?: string;
}) {
  return prisma.gitHubCommit.create({
    data,
  });
}

export async function getGitHubCommitsByVersionId(documentVersionId: string) {
  return prisma.gitHubCommit.findMany({
    where: { documentVersionId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getGitHubCommitsByPRNumber(prNumber: number) {
  return prisma.gitHubCommit.findMany({
    where: { prNumber },
  });
}

export async function updateGitHubCommitPRStatus(id: string, prStatus: GitHubPRStatus) {
  return prisma.gitHubCommit.update({
    where: { id },
    data: { prStatus },
  });
}
