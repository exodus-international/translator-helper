import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { listTargetLanguages } from "@/domain/language/language.repository";
import { getUserLanguagesCountAction } from "@/domain/user-language/user-language.actions";
import OnboardingLanguagesClient from "./page.client";

export default async function OnboardingLanguagesPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  // Check if user already has languages selected
  const languagesCount = await getUserLanguagesCountAction();
  if (languagesCount > 0) {
    redirect("/dashboard");
  }

  // Fetch target languages (excluding English)
  const languages = await listTargetLanguages();

  return <OnboardingLanguagesClient languages={languages} />;
}



