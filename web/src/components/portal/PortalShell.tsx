'use client';

import {
  Bot,
  ChartCandlestick,
  ClipboardCheck,
  ExternalLink,
  FileText,
  FolderTree,
  Globe,
  HardDrive,
  Images,
  Inbox,
  KeyRound,
  LayoutDashboard,
  LayoutTemplate,
  Library,
  Link2,
  LogOut,
  Menu,
  Newspaper,
  Rss,
  ScrollText,
  ShieldCheck,
  UserRound,
  Users,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createContext, useContext, useState } from 'react';
import { toast } from 'sonner';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { can } from '@/portal/access';
import { api, ApiError, errorMessage } from '@/portal/api';
import { initials } from '@/portal/format';
import { useIncomingCount, useMe } from '@/portal/queries';
import { primaryRole, roleLabel } from '@/portal/roles';
import type { StaffMe } from '@/portal/types';

const MeContext = createContext<StaffMe | null>(null);

/** The signed-in staff member, inside the portal shell. */
export function usePortalMe(): StaffMe {
  const me = useContext(MeContext);
  if (!me) throw new Error('usePortalMe() used outside <PortalShell>.');
  return me;
}

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Shown only to people holding this permission. */
  permission?: string;
  /** Shows the number of incoming items waiting. */
  incomingBadge?: boolean;
}

const NAV: { title?: string; items: NavItem[] }[] = [
  { items: [{ href: '/admin', label: 'Dashboard', icon: LayoutDashboard }] },
  {
    title: 'Newsroom',
    items: [
      {
        href: '/admin/my-work',
        label: 'My work',
        icon: Inbox,
        permission: 'news.read',
      },
      {
        href: '/admin/inbox',
        label: 'Incoming news',
        icon: Newspaper,
        permission: 'sources.read',
        incomingBadge: true,
      },
      {
        href: '/admin/articles',
        label: 'Articles',
        icon: FileText,
        permission: 'news.read',
      },
      {
        href: '/admin/review',
        label: 'Review queue',
        icon: ClipboardCheck,
        permission: 'news.approve',
      },
      {
        href: '/admin/media',
        label: 'Media library',
        icon: Images,
        permission: 'media.upload',
      },
      {
        href: '/admin/widgets',
        label: 'Saved widgets',
        icon: Library,
        permission: 'widgets.read',
      },
      {
        href: '/admin/taxonomy',
        label: 'Categories & tags',
        icon: FolderTree,
        permission: 'news.read',
      },
    ],
  },
  {
    title: 'Sources & AI',
    items: [
      {
        href: '/admin/sources',
        label: 'News sources',
        icon: Rss,
        permission: 'sources.read',
      },
      {
        href: '/admin/stock-mapping',
        label: 'Stock mapping',
        icon: Link2,
        permission: 'sources.read',
      },
      {
        href: '/admin/ai',
        label: 'AI assistant',
        icon: Bot,
        permission: 'ai.configure',
      },
    ],
  },
  {
    title: 'People',
    items: [
      {
        href: '/admin/staff',
        label: 'Staff',
        icon: Users,
        permission: 'staff.read',
      },
      {
        href: '/admin/roles',
        label: 'Roles & permissions',
        icon: ShieldCheck,
        permission: 'staff.read',
      },
      {
        href: '/admin/users',
        label: 'App users',
        icon: UserRound,
        permission: 'users.read',
      },
    ],
  },
  {
    title: 'Website',
    items: [
      {
        href: '/admin/homepage',
        label: 'News homepage',
        icon: LayoutTemplate,
        permission: 'site.manage',
      },
      {
        href: '/admin/market',
        label: 'Market data',
        icon: ChartCandlestick,
        permission: 'market.configure',
      },
      {
        href: '/admin/settings',
        label: 'Site settings',
        icon: Globe,
        permission: 'settings.read',
      },
      {
        href: '/admin/storage',
        label: 'Media storage',
        icon: HardDrive,
        permission: 'media.storage',
      },
    ],
  },
  {
    title: 'System',
    items: [
      {
        href: '/admin/audit',
        label: 'Audit log',
        icon: ScrollText,
        permission: 'audit.read',
      },
      { href: '/admin/security', label: 'Security', icon: KeyRound },
    ],
  },
];

function isActive(pathname: string, href: string) {
  if (href === '/admin') return pathname === '/admin';
  return pathname === href || pathname.startsWith(`${href}/`);
}

function Brand() {
  return (
    <Link
      href="/admin"
      className="flex h-16 shrink-0 items-center gap-3 border-b border-sidebar-border px-5"
    >
      <span className="grid size-9 place-items-center rounded-lg bg-linear-to-br from-green-400 to-green-700 font-display text-sm font-bold text-white shadow-sm ring-1 ring-white/10">
        SV
      </span>
      <span className="leading-tight">
        <span className="block font-display text-[15px] font-semibold text-white">
          StockVirtue
        </span>
        <span className="block text-xs text-sidebar-muted">Newsroom</span>
      </span>
    </Link>
  );
}

function SidebarNav({
  me,
  onNavigate,
}: {
  me: StaffMe;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const incoming = useIncomingCount(can(me, 'sources.read'));
  return (
    <nav
      aria-label="Portal"
      className="flex flex-1 flex-col gap-6 overflow-y-auto px-3 py-5"
    >
      {NAV.map((section, i) => {
        const items = section.items.filter(
          (it) => !it.permission || can(me, it.permission),
        );
        if (items.length === 0) return null;
        return (
          <div key={section.title ?? i}>
            {section.title && (
              <p className="px-3 pb-2 text-[11px] font-semibold tracking-wider text-sidebar-muted uppercase">
                {section.title}
              </p>
            )}
            <ul className="flex flex-col gap-0.5">
              {items.map((it) => {
                const active = isActive(pathname, it.href);
                return (
                  <li key={it.href}>
                    <Link
                      href={it.href}
                      onClick={onNavigate}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                        active
                          ? 'bg-sidebar-accent text-white'
                          : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-white',
                      )}
                    >
                      <it.icon
                        className={cn(
                          'size-4',
                          active
                            ? 'text-sidebar-primary'
                            : 'text-sidebar-muted group-hover:text-sidebar-foreground',
                        )}
                        aria-hidden
                      />
                      {it.label}
                      {it.incomingBadge && !!incoming.data && (
                        <span
                          className="ml-auto rounded-full bg-sidebar-primary/20 px-1.5 text-[11px] font-semibold text-sidebar-primary tabular-nums"
                          aria-label={`${incoming.data} waiting`}
                        >
                          {incoming.data > 99 ? '99+' : incoming.data}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

function SidebarFooter({ me }: { me: StaffMe }) {
  const role = primaryRole(me.roles);
  return (
    <Link
      href="/admin/profile"
      className="flex items-center gap-3 border-t border-sidebar-border px-5 py-4 transition-colors hover:bg-sidebar-accent/50"
    >
      <Avatar className="size-8">
        <AvatarFallback className="bg-sidebar-accent text-xs font-semibold text-sidebar-primary">
          {initials(me.displayName)}
        </AvatarFallback>
      </Avatar>
      <span className="min-w-0 leading-tight">
        <span className="block truncate text-sm font-medium text-white">
          {me.displayName}
        </span>
        <span className="block truncate text-xs text-sidebar-muted">
          {role ? roleLabel(role) : 'Staff'}
          {me.roles.length > 1 ? ` +${me.roles.length - 1}` : ''}
        </span>
      </span>
    </Link>
  );
}

async function signOut() {
  try {
    await api('staff/auth/logout', { method: 'POST', signInFlow: true });
  } catch (err) {
    // Any reply means the server cleared the cookie; only stay if offline.
    if (err instanceof ApiError && err.status === 0) {
      toast.error(errorMessage(err));
      return;
    }
  }
  window.location.assign('/admin/login?signedOut=1');
}

function UserMenu({ me }: { me: StaffMe }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="h-9 gap-2 px-2"
          aria-label="Account menu"
        >
          <Avatar className="size-7">
            <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
              {initials(me.displayName)}
            </AvatarFallback>
          </Avatar>
          <span className="hidden max-w-40 truncate text-sm font-medium sm:inline">
            {me.displayName}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <span className="block truncate text-sm font-medium">
            {me.displayName}
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {me.email}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/admin/profile">
            <UserRound /> Profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/admin/security">
            <KeyRound /> Sessions & security
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void signOut()}>
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function PortalShell({
  me: initialMe,
  children,
}: {
  me: StaffMe;
  children: React.ReactNode;
}) {
  const { data: me } = useMe(initialMe);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <MeContext.Provider value={me}>
      <div className="min-h-dvh bg-background">
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-sidebar text-sidebar-foreground lg:flex">
          <Brand />
          <SidebarNav me={me} />
          <SidebarFooter me={me} />
        </aside>

        <div className="lg:pl-64">
          <header className="sticky top-0 z-20 flex h-16 items-center gap-2 border-b bg-background/85 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/70 sm:px-6">
            <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="lg:hidden"
                  aria-label="Open menu"
                >
                  <Menu />
                </Button>
              </SheetTrigger>
              <SheetContent
                side="left"
                className="flex w-72 flex-col gap-0 border-sidebar-border bg-sidebar p-0 text-sidebar-foreground"
              >
                <SheetTitle className="sr-only">Newsroom menu</SheetTitle>
                <SheetDescription className="sr-only">
                  Pages you have access to
                </SheetDescription>
                <Brand />
                <SidebarNav me={me} onNavigate={() => setMenuOpen(false)} />
                <SidebarFooter me={me} />
              </SheetContent>
            </Sheet>
            <span className="font-display text-sm font-semibold lg:hidden">
              Newsroom
            </span>
            <div className="flex-1" />
            <Button
              variant="ghost"
              size="sm"
              asChild
              className="text-muted-foreground"
            >
              <a href="/" target="_blank" rel="noopener">
                <ExternalLink />{' '}
                <span className="hidden sm:inline">View website</span>
              </a>
            </Button>
            <UserMenu me={me} />
          </header>
          <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:py-8">
            {children}
          </main>
        </div>
      </div>
    </MeContext.Provider>
  );
}
