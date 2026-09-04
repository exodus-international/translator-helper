'use client';

import { Logo } from '@/components/logo';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { UserAvatar } from '@/components/user-avatar';
import { capture } from '@/lib/analytics';
import { signOut } from '@/lib/auth-client';
import { SessionUser } from '@/lib/session';
import { cn } from '@/lib/utils';
import {
  FilePlus,
  FileText,
  FolderKanban,
  Languages,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Menu,
  ScrollText,
  Users,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const NAV_ITEMS: NavItem[] = [{ href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard }];

const ADMIN_NAV_ITEMS: NavItem[] = [
  { href: '/documents', label: 'Documents', icon: FileText },
  { href: '/admin/languages', label: 'Languages', icon: Languages },
  { href: '/admin/projects', label: 'Projects', icon: FolderKanban },
  { href: '/admin/users', label: 'Users', icon: Users },
  { href: '/admin/announcements', label: 'Announcements', icon: Megaphone },
  { href: '/settings/language-instructions', label: 'Language Instructions', icon: ScrollText },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

const DESKTOP_LINK_CLASS = 'text-sm text-muted-foreground transition-colors hover:text-foreground';
const DESKTOP_LINK_ACTIVE_CLASS = 'font-medium text-foreground';

function DesktopNavLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={cn(DESKTOP_LINK_CLASS, active && DESKTOP_LINK_ACTIVE_CLASS)}
    >
      {item.label}
    </Link>
  );
}

function MobileNavLink({
  item,
  active,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  onNavigate: () => void;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex items-center gap-2.5 rounded-md px-3 py-2.5 text-sm font-medium transition-colors',
        active ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
      )}
    >
      <Icon className="size-4 shrink-0" />
      {item.label}
    </Link>
  );
}

interface NavigationProps {
  user: SessionUser | null;
}

export function Navigation({ user }: NavigationProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleSignOut = async () => {
    capture('user_signed_out');
    await signOut();
    router.push('/login');
    // Re-render the root layout with the cleared session so PostHogProvider
    // calls reset() and the next visitor doesn't inherit this identity.
    router.refresh();
  };

  const closeMobileMenu = () => setMobileMenuOpen(false);

  if (!user) {
    return null;
  }

  return (
    <nav className="sticky top-0 z-30 border-b bg-background">
      <div className="mx-auto flex h-14 w-full max-w-screen-2xl items-center justify-between gap-2 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-1 md:gap-4">
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu">
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="flex w-80 flex-col gap-0 p-0">
              <SheetHeader className="border-b p-4 text-left">
                <SheetTitle className="flex items-center gap-2 text-base font-bold">
                  <Logo size={24} />
                  Translation Helper
                </SheetTitle>
                <SheetDescription className="sr-only">Main navigation</SheetDescription>
              </SheetHeader>
              <nav aria-label="Main" className="flex-1 overflow-y-auto p-2">
                <div className="flex flex-col gap-0.5">
                  {NAV_ITEMS.map((item) => (
                    <MobileNavLink
                      key={item.href}
                      item={item}
                      active={isActive(pathname, item.href)}
                      onNavigate={closeMobileMenu}
                    />
                  ))}
                </div>
                {user.role === 'ADMIN' && (
                  <>
                    <p className="px-3 pb-1.5 pt-5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                      Admin
                    </p>
                    <div className="flex flex-col gap-0.5">
                      {ADMIN_NAV_ITEMS.map((item) => (
                        <MobileNavLink
                          key={item.href}
                          item={item}
                          active={isActive(pathname, item.href)}
                          onNavigate={closeMobileMenu}
                        />
                      ))}
                    </div>
                    <Separator className="my-3" />
                    <Link
                      href="/documents/new"
                      onClick={closeMobileMenu}
                      className="flex items-center gap-2.5 rounded-md px-3 py-2.5 text-sm font-medium text-primary transition-colors hover:bg-accent/60"
                    >
                      <FilePlus className="size-4 shrink-0" />
                      New document
                    </Link>
                  </>
                )}
              </nav>
              <div className="border-t p-3">
                <Link href="/profile" onClick={closeMobileMenu} className="flex items-center gap-2.5 rounded-md px-1 py-1.5 hover:opacity-80">
                  <UserAvatar name={user.name} image={user.image} email={user.email} size="sm" eager />
                  <span className="truncate text-sm font-medium">{user.name}</span>
                </Link>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2 w-full justify-start"
                  onClick={handleSignOut}
                >
                  <LogOut />
                  Sign out
                </Button>
              </div>
            </SheetContent>
          </Sheet>

          <Link
            href="/dashboard"
            className="flex shrink-0 items-center gap-2 whitespace-nowrap text-base font-bold"
          >
            <Logo size={24} />
            {/* nowrap: the admin nav is crowded enough to break "Translation
                Helper" across two lines, which reads as broken next to a
                single-line mark. */}
            <span className="hidden min-[420px]:inline">Translation Helper</span>
          </Link>
          <div className="hidden items-center gap-4 md:flex">
            {NAV_ITEMS.map((item) => (
              <DesktopNavLink key={item.href} item={item} active={isActive(pathname, item.href)} />
            ))}
            {user.role === 'ADMIN' &&
              ADMIN_NAV_ITEMS.map((item) => (
                <DesktopNavLink key={item.href} item={item} active={isActive(pathname, item.href)} />
              ))}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          {user.role === 'ADMIN' && (
            <Button asChild size="sm" className="hidden sm:inline-flex">
              <Link href="/documents/new">
                <FilePlus />
                New
              </Link>
            </Button>
          )}
          <Link href="/profile" className="flex items-center gap-2 hover:opacity-80">
            <UserAvatar name={user.name} image={user.image} email={user.email} size="sm" eager />
            <span className="hidden truncate text-sm text-muted-foreground md:inline">{user.name}</span>
          </Link>
          <Button variant="outline" size="icon" onClick={handleSignOut} aria-label="Sign out">
            <LogOut />
          </Button>
        </div>
      </div>
    </nav>
  );
}
