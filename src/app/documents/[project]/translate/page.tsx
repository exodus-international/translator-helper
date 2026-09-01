import { redirectToCanonical } from '../legacy-redirect';

export default async function LegacyTranslatePage({
  params,
  searchParams,
}: {
  params: Promise<{ project: string }>;
  searchParams: Promise<{ lang?: string; version?: string }>;
}) {
  const { project: documentId } = await params;
  const { lang, version } = await searchParams;
  await redirectToCanonical(documentId, { languageId: lang, versionId: version });
}
