import { Role } from '@prisma/client';
import { SessionUser } from './session';
import {
  isUserProjectManagerForSourceProject as isUserProjectManagerForSourceProjectRepo,
  isUserMemberOfSourceProject as isUserMemberOfSourceProjectRepo,
} from '@/domain/project-member/project-member.repository';

// ─── Source-project-scoped permissions ───────────────────────
// These check membership across translation projects within a source project.
// They use different DB queries than the authorize() gateway (which operates
// on translation project IDs), so they remain here until source-project
// permissions are integrated into the gateway.

export async function canAccessSourceProject(user: SessionUser, sourceProjectId: string): Promise<boolean> {
  if (user.role === Role.ADMIN) {
    return true;
  }

  return await isUserMemberOfSourceProjectRepo(user.id, sourceProjectId);
}

export async function canManageSourceProject(user: SessionUser, sourceProjectId: string): Promise<boolean> {
  if (user.role === Role.ADMIN) {
    return true;
  }

  return await isUserProjectManagerForSourceProjectRepo(user.id, sourceProjectId);
}
