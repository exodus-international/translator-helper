import { ProjectRole, Role } from '@/generated/prisma/enums';
import { requireUser, type SessionUser } from './session';
import { getUserRoleForLanguage, getUserRolesInProject } from '@/domain/user-language/user-language.repository';
// ─── Types ───────────────────────────────────────────────────

type ProjectPermissionRole = 'manager' | 'reviewer' | 'editor' | 'translator' | 'member';

type Permission =
  | 'authenticated'
  | 'admin'
  | 'can:manage-folders'
  | 'can:manage-languages'
  | { project: string; role: ProjectPermissionRole }
  | { project: string; roles: ProjectPermissionRole[] }
  // Language-scoped, for the screens whose subject is the language itself
  // rather than a project in it. A UserLanguage row already grants its role on
  // every project in the language, so this asks the same question one step
  // earlier, without a project to route through.
  | { language: string; role: ProjectPermissionRole };

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
  /** Resolved from the user's role on the project's language. */
  getUserRolesInProject: (userId: string, projectId: string) => Promise<ProjectRole[]>;
  /** The user's single role on a language, or null when they are not on it. */
  getUserRoleForLanguage: (userId: string, languageId: string) => Promise<ProjectRole | null>;
}

const defaultDeps: AuthorizeDeps = {
  requireUser,
  getUserRolesInProject,
  getUserRoleForLanguage,
};

// ─── Implementation ──────────────────────────────────────────

export function createAuthorize(deps: AuthorizeDeps = defaultDeps) {
  return async function authorize(permission: Permission): Promise<AuthResult> {
    const user = await deps.requireUser();

    // Global permissions
    if (typeof permission === 'string') {
      if (permission === 'authenticated') {
        return { user };
      }

      const isAdmin = user.role === Role.ADMIN;

      if (permission === 'admin' || permission === 'can:manage-folders' || permission === 'can:manage-languages') {
        if (!isAdmin) {
          throw new Error(`Forbidden: requires '${permission}' permission`);
        }
        return { user };
      }
    }

    // Language-scoped permissions
    if (typeof permission === 'object' && 'language' in permission) {
      if (user.role === Role.ADMIN) {
        return { user, projectRoles: [ProjectRole.PROJECT_MANAGER] };
      }

      const languageRole = await deps.getUserRoleForLanguage(user.id, permission.language);
      const allowed = languageRole !== null && ROLE_HIERARCHY[permission.role].includes(languageRole);

      if (!allowed) {
        throw new Error(`Forbidden: requires '${permission.role}' permission in language`);
      }

      return { user, projectRoles: [languageRole] };
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
