import { Role } from '@/generated/prisma/enums';

/**
 * Coerces an unrecognised role to USER before a user write reaches the
 * database.
 *
 * The Prisma client in `db.ts` runs this on every user create and update. A
 * role the enum does not know is never an upgrade: whatever a caller sent, the
 * row ends up an ordinary user.
 */
export function ensureValidRole(args: { data?: { role?: unknown } }): void {
  if (args.data?.role && !Object.values(Role).includes(args.data.role as Role)) {
    args.data.role = Role.USER;
  }
}
