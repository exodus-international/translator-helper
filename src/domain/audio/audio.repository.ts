import prisma from '@/lib/db';
import { AudioProvider, AudioStatus } from '@prisma/client';

export async function createAudioFile(data: {
  documentVersionId: string;
  provider: AudioProvider;
  voice: string;
  sourceVersion: number;
  triggeredByUserId: string | null;
}) {
  return prisma.audioFile.create({ data });
}

export async function getAudioFileById(id: string) {
  return prisma.audioFile.findUnique({ where: { id } });
}

export async function getLatestAudioFileForVersion(documentVersionId: string) {
  return prisma.audioFile.findFirst({
    where: { documentVersionId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function setAudioFileJob(id: string, providerJobId: string) {
  return prisma.audioFile.update({ where: { id }, data: { providerJobId } });
}

/**
 * Moves a PENDING record to PROCESSING and reports whether this caller won.
 * Two concurrent callers both try; only one sees count === 1.
 */
export async function claimAudioFileForProcessing(id: string): Promise<boolean> {
  const { count } = await prisma.audioFile.updateMany({
    where: { id, status: AudioStatus.PENDING },
    data: { status: AudioStatus.PROCESSING },
  });
  return count === 1;
}

export async function releaseAudioFileToPending(id: string) {
  return prisma.audioFile.updateMany({
    where: { id, status: AudioStatus.PROCESSING },
    data: { status: AudioStatus.PENDING },
  });
}

export async function markAudioFileReady(
  id: string,
  data: { objectKey: string; url: string; durationMs?: number; sizeBytes?: number; billedCharacters?: number },
) {
  return prisma.audioFile.update({
    where: { id },
    data: { status: AudioStatus.READY, errorMessage: null, ...data },
  });
}

export async function markAudioFileFailed(id: string, errorMessage: string) {
  return prisma.audioFile.update({
    where: { id },
    data: { status: AudioStatus.FAILED, errorMessage: errorMessage.slice(0, 2000) },
  });
}

/** In-flight records nobody has touched for a while: candidates for the scheduled sweep. */
export async function findStalledAudioFiles(olderThan: Date, limit = 50) {
  return prisma.audioFile.findMany({
    where: { status: { in: [AudioStatus.PENDING, AudioStatus.PROCESSING] }, updatedAt: { lt: olderThan } },
    orderBy: { updatedAt: 'asc' },
    take: limit,
  });
}
