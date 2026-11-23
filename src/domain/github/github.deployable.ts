import { DocumentStatus } from '@/generated/prisma/enums';

/**
 * The statuses a version may be published to GitHub from. Only reviewed text
 * leaves the app: APPROVED is the status a deploy starts from, and a DEPLOYED
 * version can be deployed again, to republish it after the repository changed.
 */
const DEPLOYABLE_STATUSES: readonly DocumentStatus[] = [DocumentStatus.APPROVED, DocumentStatus.DEPLOYED];

export function isDeployableStatus(status: DocumentStatus): boolean {
  return DEPLOYABLE_STATUSES.includes(status);
}

export function assertDeployableStatus(status: DocumentStatus): void {
  if (!isDeployableStatus(status)) {
    throw new Error(`Only approved translations can be deployed. This version is ${status}.`);
  }
}
