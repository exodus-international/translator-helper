import { redirectToCanonical } from '../legacy-redirect';

export default async function LegacyReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ project: string }>;
  searchParams: Promise<{ version?: string }>;
}) {
  const { project: documentId } = await params;
  const { version } = await searchParams;
  await redirectToCanonical(documentId, { versionId: version });
}
