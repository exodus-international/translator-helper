'use client';

import { Logo } from '@/components/logo';
import { UserAvatar } from '@/components/user-avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { Separator } from '@/components/ui/separator';
import { capture } from '@/lib/analytics';
import { signOut } from '@/lib/auth-client';
import { SessionUser } from '@/lib/session';
import {
  FilePlus,
  FileText,
  FolderKanban,
  Languages,
  LayoutDashboard,
  LogOut,
  Megaphone,
  ScrollText,
  User,
  Users,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

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

function SidebarNavGroup({ items, label }: { items: NavItem[]; label?: string }) {
  const pathname = usePathname();

  return (
    <SidebarGroup>
      {label && <SidebarGroupLabel>{label}</SidebarGroupLabel>}
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton
                  isActive={active}
                  tooltip={item.label}
                  render={<Link href={item.href} aria-current={active ? 'page' : undefined} />}
                >
                  <item.icon />
                  <span>{item.label}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

function NavUser({ user }: { user: SessionUser }) {
  const router = useRouter();

  const handleSignOut = async () => {
    capture('user_signed_out');
    await signOut();
    router.push('/login');
    // Re-render the root layout with the cleared session so PostHogProvider
    // calls reset() and the next visitor doesn't inherit this identity.
    router.refresh();
  };

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                size="lg"
                className="data-popup-open:bg-sidebar-accent data-popup-open:text-sidebar-accent-foreground"
              />
            }
          >
            <UserAvatar name={user.name} image={user.image} email={user.email} size="sm" eager />
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">{user.name}</span>
              <span className="truncate text-xs text-muted-foreground">{user.email}</span>
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-(--anchor-width) min-w-56 rounded-lg" side="right" align="end" sideOffset={4}>
            {/* GroupLabel (what DropdownMenuLabel wraps) requires Menu.Group context. */}
            <DropdownMenuGroup>
              <DropdownMenuLabel className="p-0 font-normal">
                <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                  <UserAvatar name={user.name} image={user.image} email={user.email} size="sm" eager />
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium">{user.name}</span>
                    <span className="truncate text-xs text-muted-foreground">{user.email}</span>
                  </div>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem render={<Link href="/profile" />}>
                <User />
                Profile
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut}>
              <LogOut />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

export function AppSidebar(props: React.ComponentProps<typeof Sidebar> & { user: SessionUser }) {
  const { user, ...sidebarProps } = props;

  return (
    <Sidebar collapsible="icon" pinned {...sidebarProps}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" tooltip="Translation Helper" render={<Link href="/dashboard" />}>
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <Logo size={20} />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">Translation Helper</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarNavGroup items={NAV_ITEMS} />
        {user.role === 'ADMIN' && <SidebarNavGroup items={ADMIN_NAV_ITEMS} label="Admin" />}
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

interface AppShellProps {
  user: SessionUser | null;
  /** Server-read sidebar state cookie, so the first paint already has the right width. */
  defaultOpen?: boolean;
  children: React.ReactNode;
}

export function AppShell({ user, defaultOpen = true, children }: AppShellProps) {
  if (!user) {
    return <>{children}</>;
  }

  return (
    <SidebarProvider
      defaultOpen={defaultOpen}
      style={{ '--sidebar-width': '16rem' } as React.CSSProperties}
    >
      <AppSidebar user={user} />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
          <div className="flex items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
          </div>
          {user.role === 'ADMIN' && (
            <div className="ml-auto flex items-center gap-2 px-4">
              <Button size="sm" nativeButton={false} render={<Link href="/documents/new" />}>
                <FilePlus />
                New
              </Button>
            </div>
          )}
        </header>
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
