import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { canManageFolders } from "@/lib/permissions";
import { getSourceProjectAction } from "@/domain/source-project/source-project.actions";
import { listTranslationProjectsAction } from "@/domain/translation-project/translation-project.actions";
import { listTargetLanguages } from "@/domain/language/language.repository";
import TranslationsClient from "./page.client";

export default async function TranslationsPage({
  params,
}: {
  params: Promise<{ sourceProjectId: string }>;
}) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (!canManageFolders(user)) {
    redirect("/dashboard");
  }

  const { sourceProjectId } = await params;
  const sourceProject = await getSourceProjectAction(sourceProjectId);

  if (!sourceProject) {
    notFound();
  }

  const translationProjects = await listTranslationProjectsAction({
    sourceProjectId,
  });
  const languages = await listTargetLanguages();

  return (
    <TranslationsClient
      sourceProject={sourceProject}
      translationProjects={translationProjects}
      languages={languages}
    />
  );
}
