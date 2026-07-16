'use client';

import { adminClient } from 'better-auth/client/plugins';
import { createAccessControl } from 'better-auth/plugins/access';
import { createAuthClient } from 'better-auth/react';

// Create access control (must match server-side; mirrored from src/lib/auth.ts by better-auth convention)
// fallow-ignore-next-line code-duplication
const statement = {
  user: ['create', 'read', 'update', 'delete', 'ban', 'unban', 'set-password', 'set-role'],
  session: ['read', 'delete', 'revoke'],
} as const;

const ac = createAccessControl(statement);

// Define ADMIN role with all admin permissions
const adminRole = ac.newRole({
  user: ['create', 'read', 'update', 'delete', 'ban', 'unban', 'set-password', 'set-role'],
  session: ['read', 'delete', 'revoke'],
});

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
  plugins: [
    adminClient({
      ac,
      roles: {
        ADMIN: adminRole,
      },
    }),
  ],
});

// fallow-ignore-next-line unused-export
export const { signIn, signUp, signOut, useSession } = authClient;
