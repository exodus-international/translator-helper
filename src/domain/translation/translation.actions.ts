"use server";

import { getLanguageById } from "@/domain/language/language.repository";
import { requireUser } from "@/lib/session";
import { translateWithChatGPT } from "./translation.service";
import { translateDocumentSchema } from "./translation.types";

export async function translateDocumentAction(input: unknown) {
  await requireUser();

  const validated = translateDocumentSchema.parse(input);
  const targetLanguage = await getLanguageById(validated.targetLanguageId);

  if (!targetLanguage) {
    throw new Error("Target language not found");
  }

  const translatedContent = await translateWithChatGPT({
    documentTitle: validated.documentTitle,
    sourceLanguageName: validated.sourceLanguageName,
    targetLanguageName: targetLanguage.name,
    targetLanguageCode: targetLanguage.code,
    sourceContent: validated.sourceContent,
    languageInstructions: targetLanguage.translationInstructions ?? "",
    currentTranslation: validated.currentTranslation,
  });

  return { translatedContent };
}

