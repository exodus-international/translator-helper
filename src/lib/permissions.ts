import { Role, ProjectRole } from '@prisma/client';
import { SessionUser } from './session';
import {
  getUserRoleInProject as getUserRoleInProjectRepo,
  getUserRolesInProject as getUserRolesInProjectRepo,
  isUserProjectManagerForSourceProject as isUserProjectManagerForSourceProjectRepo,
  isUserMemberOfSourceProject as isUserMemberOfSourceProjectRepo,
} from '@/domain/project-member/project-member.repository';

export function isTranslator(user: SessionUser): boolean {
  return user.role === Role.TRANSLATOR;
}

export function isDeployer(user: SessionUser): boolean {
  return user.role === Role.DEPLOYER;
}

export function canTranslate(user: SessionUser): boolean {
  return user.role === Role.TRANSLATOR || user.role === Role.DEPLOYER;
}

export function canReview(user: SessionUser): boolean {
  return user.role === Role.TRANSLATOR || user.role === Role.DEPLOYER;
}

export function canDeploy(user: SessionUser): boolean {
  return user.role === Role.DEPLOYER;
}

export function canManageLanguages(user: SessionUser): boolean {
  return user.role === Role.DEPLOYER;
}

export function canManageFolders(user: SessionUser): boolean {
  return user.role === Role.DEPLOYER;
}

// Project-scoped permissions
export async function isProjectManager(user: SessionUser, translationProjectId: string): Promise<boolean> {
  // Deployers have all permissions
  if (user.role === Role.DEPLOYER) {
    return true;
  }

  const roles = await getUserRolesInProjectRepo(user.id, translationProjectId);
  return roles.includes(ProjectRole.PROJECT_MANAGER);
}

export async function isReviewer(user: SessionUser, translationProjectId: string): Promise<boolean> {
  // Deployers have all permissions
  if (user.role === Role.DEPLOYER) {
    return true;
  }

  const roles = await getUserRolesInProjectRepo(user.id, translationProjectId);
  return (
    roles.includes(ProjectRole.REVIEWER) ||
    roles.includes(ProjectRole.EDITOR) ||
    roles.includes(ProjectRole.PROJECT_MANAGER)
  );
}

export async function isEditor(user: SessionUser, translationProjectId: string): Promise<boolean> {
  // Deployers have all permissions
  if (user.role === Role.DEPLOYER) {
    return true;
  }

  const roles = await getUserRolesInProjectRepo(user.id, translationProjectId);
  return roles.includes(ProjectRole.EDITOR) || roles.includes(ProjectRole.PROJECT_MANAGER);
}

export async function canAssignDocuments(user: SessionUser, translationProjectId: string): Promise<boolean> {
  // Deployers have all permissions
  if (user.role === Role.DEPLOYER) {
    return true;
  }

  const roles = await getUserRolesInProjectRepo(user.id, translationProjectId);
  return roles.includes(ProjectRole.PROJECT_MANAGER);
}

export async function canReviewInProject(
  user: SessionUser,
  translationProjectId: string,
  documentVersionId?: string,
): Promise<boolean> {
  // Deployers have all permissions
  if (user.role === Role.DEPLOYER) {
    return true;
  }

  const roles = await getUserRolesInProjectRepo(user.id, translationProjectId);
  return (
    roles.includes(ProjectRole.REVIEWER) ||
    roles.includes(ProjectRole.EDITOR) ||
    roles.includes(ProjectRole.PROJECT_MANAGER)
  );
}

export async function canEditInProject(
  user: SessionUser,
  translationProjectId: string,
  documentVersionId?: string,
): Promise<boolean> {
  // Deployers have all permissions
  if (user.role === Role.DEPLOYER) {
    return true;
  }

  const roles = await getUserRolesInProjectRepo(user.id, translationProjectId);
  return roles.includes(ProjectRole.EDITOR) || roles.includes(ProjectRole.PROJECT_MANAGER);
}

export async function canTranslateInProject(user: SessionUser, translationProjectId: string): Promise<boolean> {
  // Deployers have all permissions
  if (user.role === Role.DEPLOYER) {
    return true;
  }

  const roles = await getUserRolesInProjectRepo(user.id, translationProjectId);
  return (
    roles.includes(ProjectRole.TRANSLATOR) ||
    roles.includes(ProjectRole.REVIEWER) ||
    roles.includes(ProjectRole.EDITOR) ||
    roles.includes(ProjectRole.PROJECT_MANAGER)
  );
}

export async function isProjectMember(user: SessionUser, translationProjectId: string): Promise<boolean> {
  // Deployers have access to all projects
  if (user.role === Role.DEPLOYER) {
    return true;
  }

  const roles = await getUserRolesInProjectRepo(user.id, translationProjectId);
  return roles.length > 0;
}

export async function getUserRolesInProject(user: SessionUser, translationProjectId: string): Promise<ProjectRole[]> {
  // Deployers are treated as PROJECT_MANAGER for all projects
  if (user.role === Role.DEPLOYER) {
    return [ProjectRole.PROJECT_MANAGER];
  }

  return await getUserRolesInProjectRepo(user.id, translationProjectId);
}

export async function getUserRoleInProject(
  user: SessionUser,
  translationProjectId: string,
): Promise<ProjectRole | null> {
  // Deployers are treated as PROJECT_MANAGER for all projects
  if (user.role === Role.DEPLOYER) {
    return ProjectRole.PROJECT_MANAGER;
  }

  const roles = await getUserRolesInProjectRepo(user.id, translationProjectId);
  return roles.length > 0 ? roles[0] : null;
}

export async function canAccessSourceProject(user: SessionUser, sourceProjectId: string): Promise<boolean> {
  if (user.role === Role.DEPLOYER) {
    return true;
  }

  return await isUserMemberOfSourceProjectRepo(user.id, sourceProjectId);
}

export async function canManageSourceProject(user: SessionUser, sourceProjectId: string): Promise<boolean> {
  // Deployers can manage all source projects
  if (user.role === Role.DEPLOYER) {
    return true;
  }

  // Check if user is a project manager for any translation project within this source project
  return await isUserProjectManagerForSourceProjectRepo(user.id, sourceProjectId);
}
