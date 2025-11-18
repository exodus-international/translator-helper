import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { canManageLanguages } from "@/lib/permissions";
import { listLanguages } from "@/domain/language/language.repository";
import LanguagesClient from "./page.client";

export default async function LanguagesPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (!canManageLanguages(user)) {
    redirect("/dashboard");
  }

  const languages = await listLanguages();

  return <LanguagesClient languages={languages} />;
}
