import { redirectToCanonical } from '../legacy-redirect';

export default async function LegacyEditPage({ params }: { params: Promise<{ project: string }> }) {
  const { project: documentId } = await params;
  await redirectToCanonical(documentId, { edit: true });
}
