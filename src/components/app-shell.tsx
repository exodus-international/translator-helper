'use client';

import * as React from 'react';

import { Logo } from '@/components/logo';
import { ModeToggle } from '@/components/mode-toggle';
import { SUPPORT_URL, bugReportUrl } from '@/components/feedback-button';
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
import { isAdminClient } from '@/lib/permissions-client';
import { SessionUser } from '@/lib/session';
import {
  Bug,
  ChevronsUpDown,
  FileText,
  FolderKanban,
  Languages,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Megaphone,
  ScrollText,
  Sparkles,
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

// Segments that exist only to namespace their children: none of these have a
// page of their own, so linking them 404s. They still belong in the trail as
// labels — shadcn's Breadcrumb renders a non-navigable crumb as plain text.
const NAMESPACE_ONLY = new Set(['/admin', '/settings', '/onboarding', '/projects']);

function isNavigable(href: string) {
  // /documents is a flat list across projects, so neither the project slug nor
  // the document slug under it resolves to a page.
  return !NAMESPACE_ONLY.has(href) && !href.startsWith('/documents/');
}

function segmentLabel(segment: string): string | null {
  if (UUID_PATTERN.test(segment)) return null;
  if (SEGMENT_LABELS[segment]) return SEGMENT_LABELS[segment];
  const words = decodeURIComponent(segment).split(/[-_]+/).filter(Boolean);
  return words.length ? words.map((w) => w[0].toUpperCase() + w.slice(1)).join(' ') : null;
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
  const lastCrumb = crumbs[crumbs.length - 1];

  if (!lastCrumb) {
    return null;
  }

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {crumbs.slice(0, -1).map((crumb) => (
          <React.Fragment key={crumb.href}>
            <BreadcrumbItem className="hidden md:block">
              {isNavigable(crumb.href) ? (
                <BreadcrumbLink render={<Link href={crumb.href} />}>{crumb.label}</BreadcrumbLink>
              ) : (
                crumb.label
              )}
            </BreadcrumbItem>
            <BreadcrumbSeparator className="hidden md:block" />
          </React.Fragment>
        ))}
        <BreadcrumbItem>
          <BreadcrumbPage>{lastCrumb.label}</BreadcrumbPage>
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

// Grouped by route prefix, and sorted by href inside each group. The group
// labels are the same ones the breadcrumb uses for those segments, so the trail
// in the topbar names the section the sidebar highlights.
const ROOT_NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/documents', label: 'Documents', icon: FileText },
];

// Announcements is deliberately absent: it authors what What's New shows, so it
// lives next to it in the footer rather than a section away.
const ADMIN_NAV_ITEMS: NavItem[] = [
  { href: '/admin/languages', label: 'Languages', icon: Languages },
  { href: '/admin/projects', label: 'Projects', icon: FolderKanban },
  { href: '/admin/users', label: 'Users', icon: Users },
];

const SETTINGS_NAV_ITEMS: NavItem[] = [
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

/**
 * What's New plus the two service-desk links, pinned to the footer so they stay
 * above the user row however long the nav above them grows. Admins also get
 * Announcements here: it writes the posts What's New reads, so the pair reads as
 * one thing. Signed-out pages get the same two service links from
 * <FeedbackButton />, which has no sidebar to sit in.
 */
function NavSecondary({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const announcementsActive = isActive(pathname, '/admin/announcements');
  const releasesActive = isActive(pathname, '/releases');

  return (
    <SidebarMenu>
      {isAdmin && (
        <SidebarMenuItem>
          <SidebarMenuButton
            isActive={announcementsActive}
            tooltip="Announcements"
            render={<Link href="/admin/announcements" aria-current={announcementsActive ? 'page' : undefined} />}
          >
            <Megaphone />
            <span>Announcements</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      )}
      <SidebarMenuItem>
        <SidebarMenuButton
          isActive={releasesActive}
          tooltip="What's New"
          render={<Link href="/releases" aria-current={releasesActive ? 'page' : undefined} />}
        >
          <Sparkles />
          <span>What&apos;s New</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
      <SidebarMenuItem>
        <SidebarMenuButton
          tooltip="Support"
          onClick={() => capture('support_link_clicked')}
          render={<a href={SUPPORT_URL} target="_blank" rel="noreferrer" />}
        >
          <LifeBuoy />
          <span>Support</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
      <SidebarMenuItem>
        <SidebarMenuButton
          tooltip="Report a bug"
          onClick={() => capture('bug_report_clicked', { path: pathname })}
          render={<a href={bugReportUrl(pathname)} target="_blank" rel="noreferrer" />}
        >
          <Bug />
          <span>Report a bug</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
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
  const isAdmin = isAdminClient(user);

  return (
    <Sidebar collapsible="icon" pinned {...sidebarProps}>
      {/* Same height and rule as the topbar, so the brand row and the breadcrumb
          sit on one line and their borders meet across the shell. */}
      <SidebarHeader className="h-(--header-height) justify-center border-b">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="Translation Helper" render={<Link href="/dashboard" />}>
              <Logo size={16} />
              <span className="truncate font-semibold">Translation Helper</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {/* Documents is admin-only like the two namespaces below it, so it joins
            the root group only for admins rather than forming a group of one. */}
        <SidebarNavGroup items={isAdmin ? ROOT_NAV_ITEMS : ROOT_NAV_ITEMS.slice(0, 1)} />
        {isAdmin && (
          <>
            <SidebarNavGroup items={ADMIN_NAV_ITEMS} label="Admin" />
            <SidebarNavGroup items={SETTINGS_NAV_ITEMS} label="Settings" />
          </>
        )}
      </SidebarContent>
      <SidebarFooter>
        <NavSecondary isAdmin={isAdmin} />
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
      style={
        { '--sidebar-width': '16rem', '--header-height': 'calc(var(--spacing) * 12 + 1px)' } as React.CSSProperties
      }
    >
      <AppSidebar user={user} />
      <SidebarInset>
        <header className="bg-background sticky top-0 z-10 flex h-(--header-height) shrink-0 items-center gap-2 border-b">
          <div className="flex items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
            <HeaderBreadcrumb />
          </div>
          <div className="ml-auto flex items-center px-4">
            <ModeToggle />
          </div>
        </header>
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
