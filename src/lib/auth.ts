import { Role } from '@prisma/client';
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { admin } from 'better-auth/plugins';
import { createAccessControl } from 'better-auth/plugins/access';
import prisma from './db';

// Create access control with user management permissions
const statement = {
  user: ['create', 'read', 'update', 'delete', 'ban', 'unban'],
  session: ['read', 'delete', 'revoke'],
} as const;

const ac = createAccessControl(statement);

// Define ADMIN role with all admin permissions
const adminRole = ac.newRole({
  user: ['create', 'read', 'update', 'delete', 'ban', 'unban'],
  session: ['read', 'delete', 'revoke'],
});

const userRole = ac.newRole({
  user: ['create', 'read'],
  session: ['read', 'delete', 'revoke'],
});

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: 'postgresql',
  }),
  emailAndPassword: {
    enabled: true,
  },
  user: {
    additionalFields: {
      role: {
        type: 'string',
        enum: Object.values(Role),
        defaultValue: 'USER',
        required: true,
      },
    },
  },
  plugins: [
    admin({
      ac,
      roles: {
        ADMIN: adminRole,
        USER: userRole,
      },
    }),
  ],
  trustedOrigins: ['http://localhost:3000', process.env.NEXT_PUBLIC_APP_URL || ''],
});
