"use server";

import { requireUser } from "@/lib/session";
import { canManageFolders } from "@/lib/permissions";
import { createFolderSchema, updateFolderSchema } from "./folder.types";
import {
  listFolders,
  getFolderById,
  createFolder,
  updateFolder,
  deleteFolder,
} from "./folder.repository";

export async function listFoldersAction() {
  await requireUser();
  return await listFolders();
}

export async function getFolderAction(id: string) {
  await requireUser();
  return await getFolderById(id);
}

export async function createFolderAction(input: unknown) {
  const user = await requireUser();

  if (!canManageFolders(user)) {
    throw new Error("Forbidden: Only deployers can manage folders");
  }

  const validated = createFolderSchema.parse(input);
  return await createFolder(validated.name);
}

export async function updateFolderAction(id: string, input: unknown) {
  const user = await requireUser();

  if (!canManageFolders(user)) {
    throw new Error("Forbidden: Only deployers can manage folders");
  }

  const validated = updateFolderSchema.parse(input);
  return await updateFolder(id, validated.name);
}

export async function deleteFolderAction(id: string) {
  const user = await requireUser();

  if (!canManageFolders(user)) {
    throw new Error("Forbidden: Only deployers can manage folders");
  }

  return await deleteFolder(id);
}
