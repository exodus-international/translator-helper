'use client';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { signOut } from '@/lib/auth-client';
import { SessionUser } from '@/lib/session';
import { LogOut } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface NavigationProps {
  user: SessionUser | null;
}

export function Navigation({ user }: NavigationProps) {
  const router = useRouter();

  const handleSignOut = async () => {
    await signOut();
    router.push('/login');
  };

  if (!user) {
    return null;
  }

  return (
    <nav className="border-b bg-white">
      <div className="container mx-auto px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/dashboard" className="text-xl font-bold">
              Translation Helper
            </Link>
            <div className="flex gap-4">
              <Link href="/dashboard" className="text-sm text-gray-600 hover:text-gray-900">
                Dashboard
              </Link>
              <Link href="/documents" className="text-sm text-gray-600 hover:text-gray-900">
                Documents
              </Link>
              <Link href="/documents/new" className="text-sm text-gray-600 hover:text-gray-900">
                New Document
              </Link>
              {user.role === 'DEPLOYER' && (
                <>
                  <Link href="/admin/languages" className="text-sm text-gray-600 hover:text-gray-900">
                    Languages
                  </Link>
                  <Link href="/admin/projects" className="text-sm text-gray-600 hover:text-gray-900">
                    Projects
                  </Link>
                  <Link href="/admin/users" className="text-sm text-gray-600 hover:text-gray-900">
                    Users
                  </Link>
                  <Link href="/settings/language-instructions" className="text-sm text-gray-600 hover:text-gray-900">
                    Language Instructions
                  </Link>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Avatar size="sm" name={user.name || undefined}>
              <AvatarFallback name={user.name || undefined}>
                {user.name
                  .split(' ')
                  .map((name) => name.charAt(0))
                  .join('')}
              </AvatarFallback>
            </Avatar>
            <span className="text-sm text-gray-600">{user.name}</span>
            <Button variant="outline" size="sm" onClick={handleSignOut}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </nav>
  );
}
