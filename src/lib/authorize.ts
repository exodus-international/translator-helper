import { ProjectRole, Role } from '@prisma/client';
import { requireUser, type SessionUser } from './session';
import { getUserRolesInProject } from '@/domain/project-member/project-member.repository';
import prisma from './db';

// ─── Types ───────────────────────────────────────────────────

type ProjectPermissionRole = 'manager' | 'reviewer' | 'editor' | 'translator' | 'member';

type Permission =
  | 'authenticated'
  | 'admin'
  | 'can:deploy'
  | 'can:manage-folders'
  | 'can:manage-languages'
  | { project: string; role: ProjectPermissionRole }
  | { project: string; roles: ProjectPermissionRole[] };

interface AuthResult {
  user: SessionUser;
  projectRoles?: ProjectRole[];
}

// ─── Role hierarchy ──────────────────────────────────────────

const ROLE_HIERARCHY: Record<ProjectPermissionRole, ProjectRole[]> = {
  manager: [ProjectRole.PROJECT_MANAGER],
  editor: [ProjectRole.EDITOR, ProjectRole.PROJECT_MANAGER],
  reviewer: [ProjectRole.REVIEWER, ProjectRole.EDITOR, ProjectRole.PROJECT_MANAGER],
  translator: [ProjectRole.TRANSLATOR, ProjectRole.REVIEWER, ProjectRole.EDITOR, ProjectRole.PROJECT_MANAGER],
  member: [ProjectRole.TRANSLATOR, ProjectRole.REVIEWER, ProjectRole.EDITOR, ProjectRole.PROJECT_MANAGER],
};

// ─── Dependencies (injectable for testing) ───────────────────

export interface AuthorizeDeps {
  requireUser: () => Promise<SessionUser>;
  getUserRolesInProject: (userId: string, projectId: string) => Promise<ProjectRole[]>;
  isUserArchived: (userId: string) => Promise<boolean>;
}

async function defaultIsUserArchived(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { archivedAt: true },
  });
  return user?.archivedAt !== null && user?.archivedAt !== undefined;
}

const defaultDeps: AuthorizeDeps = {
  requireUser,
  getUserRolesInProject,
  isUserArchived: defaultIsUserArchived,
};

// ─── Implementation ──────────────────────────────────────────

export function createAuthorize(deps: AuthorizeDeps = defaultDeps) {
  return async function authorize(permission: Permission): Promise<AuthResult> {
    const user = await deps.requireUser();

    if (await deps.isUserArchived(user.id)) {
      throw new Error('Your account has been archived. Please contact an administrator.');
    }

    // Global permissions
    if (typeof permission === 'string') {
      if (permission === 'authenticated') {
        return { user };
      }

      const isAdmin = user.role === Role.ADMIN;

      if (permission === 'admin' || permission === 'can:deploy' || permission === 'can:manage-folders' || permission === 'can:manage-languages') {
        if (!isAdmin) {
          throw new Error(`Forbidden: requires '${permission}' permission`);
        }
        return { user };
      }
    }

    // Project-scoped permissions
    if (typeof permission === 'object') {
      // Admin bypass — no DB query needed
      if (user.role === Role.ADMIN) {
        return { user, projectRoles: [ProjectRole.PROJECT_MANAGER] };
      }

      const projectRoles = await deps.getUserRolesInProject(user.id, permission.project);

      // Determine which roles to check
      const rolesToCheck = 'roles' in permission ? permission.roles : [permission.role];

      // Any-of: user needs at least one matching role
      const hasPermission = rolesToCheck.some((role) => {
        const allowedProjectRoles = ROLE_HIERARCHY[role];
        return projectRoles.some((userRole) => allowedProjectRoles.includes(userRole));
      });

      if (!hasPermission) {
        const roleNames = rolesToCheck.join(' or ');
        throw new Error(`Forbidden: requires '${roleNames}' permission in project`);
      }

      return { user, projectRoles };
    }

    throw new Error(`Unknown permission type`);
  };
}

// Default instance for production use
export const authorize = createAuthorize();
