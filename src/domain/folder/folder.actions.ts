'use server';

import { authorize } from '@/lib/authorize';
import { createFolderSchema, updateFolderSchema } from './folder.types';
import { listFolders, getFolderById, createFolder, updateFolder, deleteFolder } from './folder.repository';

export async function listFoldersAction() {
  await authorize('authenticated');
  return await listFolders();
}

export async function getFolderAction(id: string) {
  await authorize('authenticated');
  return await getFolderById(id);
}

export async function createFolderAction(input: unknown) {
  await authorize('can:manage-folders');

  const validated = createFolderSchema.parse(input);
  return await createFolder(validated.name);
}

export async function updateFolderAction(id: string, input: unknown) {
  await authorize('can:manage-folders');

  const validated = updateFolderSchema.parse(input);
  return await updateFolder(id, validated.name);
}

export async function deleteFolderAction(id: string) {
  await authorize('can:manage-folders');

  return await deleteFolder(id);
}
