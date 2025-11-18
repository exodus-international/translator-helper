import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { listSourceProjectsAction } from "@/domain/source-project/source-project.actions";
import NewDocumentClient from "./page.client";

export default async function NewDocumentPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const sourceProjects = await listSourceProjectsAction();

  return <NewDocumentClient sourceProjects={sourceProjects} />;
}
