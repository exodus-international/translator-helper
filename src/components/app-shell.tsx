'use client';

import * as React from 'react';

import { Logo } from '@/components/logo';
import { UserAvatar } from '@/components/user-avatar';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
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
  useSidebar,
} from '@/components/ui/sidebar';
import { Separator } from '@/components/ui/separator';
import { capture } from '@/lib/analytics';
import { signOut } from '@/lib/auth-client';
import { SessionUser } from '@/lib/session';
import {
  ChevronsUpDown,
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

// Known labels for static route segments. Anything else (project and document
// slugs) is prettified into the trail so the current page is always the last
// crumb; bare ids (UUIDs) are skipped rather than shown.
const SEGMENT_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  documents: 'Documents',
  projects: 'Projects',
  translations: 'Translations',
  releases: 'Releases',
  admin: 'Admin',
  settings: 'Settings',
  profile: 'Profile',
  onboarding: 'Onboarding',
  new: 'New',
  edit: 'Edit',
  review: 'Review',
  translate: 'Translate',
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function segmentLabel(segment: string): string | null {
  if (UUID_PATTERN.test(segment)) return null;
  if (SEGMENT_LABELS[segment]) return SEGMENT_LABELS[segment];
  const words = decodeURIComponent(segment).split(/[-_]+/).filter(Boolean);
  return words.length
    ? words.map((w) => w[0].toUpperCase() + w.slice(1)).join(' ')
    : null;
}

function HeaderBreadcrumb() {
  const pathname = usePathname();
  const segments = pathname.split('/').filter(Boolean);
  const crumbs = segments
    .map((segment, index) => ({
      href: '/' + segments.slice(0, index + 1).join('/'),
      label: segmentLabel(segment),
    }))
    .filter((crumb) => crumb.label);
  const last = crumbs[crumbs.length - 1];

  if (!last) {
    return null;
  }

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {crumbs.slice(0, -1).map((crumb) => (
          <React.Fragment key={crumb.href}>
            <BreadcrumbItem className="hidden md:block">
              <BreadcrumbLink render={<Link href={crumb.href} />}>{crumb.label}</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator className="hidden md:block" />
          </React.Fragment>
        ))}
        <BreadcrumbItem>
          <BreadcrumbPage>{last.label}</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );
}

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

// The old navbar's "New" shortcut, kept reachable from the sidebar itself so
// admins keep a one-click path to a fresh document on desktop and mobile.
const NEW_DOCUMENT_ITEM: NavItem = { href: '/documents/new', label: 'New document', icon: FilePlus };

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
  const { isMobile } = useSidebar();

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
            <UserIdentity user={user} />
            <ChevronsUpDown className="ml-auto" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--anchor-width) min-w-56 rounded-lg"
            side={isMobile ? 'bottom' : 'right'}
            align="end"
            sideOffset={4}
          >
            {/* GroupLabel (what DropdownMenuLabel wraps) requires Menu.Group context. */}
            <DropdownMenuGroup>
              <DropdownMenuLabel className="p-0 font-normal">
                <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                  <UserIdentity user={user} />
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

/** The person block shared by the user-menu trigger and its label. */
function UserIdentity({ user }: { user: SessionUser }) {
  return (
    <>
      <UserAvatar name={user.name} image={user.image} email={user.email} size="sm" eager />
      <div className="grid flex-1 text-left text-sm leading-tight">
        <span className="truncate font-medium">{user.name}</span>
        <span className="truncate text-xs text-muted-foreground">{user.email}</span>
      </div>
    </>
  );
}

function AppSidebar(props: React.ComponentProps<typeof Sidebar> & { user: SessionUser }) {
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
        {user.role === 'ADMIN' && (
          <SidebarNavGroup items={[NEW_DOCUMENT_ITEM, ...ADMIN_NAV_ITEMS]} label="Admin" />
        )}
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
            <HeaderBreadcrumb />
          </div>
        </header>
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
