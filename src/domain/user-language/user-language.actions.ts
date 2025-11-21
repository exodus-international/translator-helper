"use server";

import { requireUser } from "@/lib/session";
import {
  getUserLanguages,
  getUserLanguageIds,
  setUserLanguages,
  userHasLanguage,
  getUserLanguagesCount,
} from "./user-language.repository";
import { setUserLanguagesSchema } from "./user-language.types";

export async function getUserLanguagesAction() {
  const user = await requireUser();
  return await getUserLanguages(user.id);
}

export async function getUserLanguageIdsAction(): Promise<string[]> {
  const user = await requireUser();
  return await getUserLanguageIds(user.id);
}

export async function setUserLanguagesAction(input: unknown) {
  const user = await requireUser();
  const validated = setUserLanguagesSchema.parse(input);

  return await setUserLanguages(user.id, validated.languageIds);
}

export async function userHasLanguageAction(languageId: string): Promise<boolean> {
  const user = await requireUser();
  return await userHasLanguage(user.id, languageId);
}

export async function getUserLanguagesCountAction(): Promise<number> {
  const user = await requireUser();
  return await getUserLanguagesCount(user.id);
}


