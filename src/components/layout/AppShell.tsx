import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Bell, Search, Rows3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import { UserRole } from '@afios/shared';
import { roleDisplayLabel } from '@/lib/roleDisplay';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { NotificationDto } from '@afios/shared';
import { getRoleHomePath } from '@/lib/rolePaths';
import { AppSidebar } from '@/components/layout/AppSidebar';
import { MobileNav } from '@/components/layout/MobileNav';
import { AccessDeniedToast } from '@/components/AccessDeniedToast';
import { CommandPalette, SearchTrigger } from '@/components/layout/CommandPalette';
import { BekemLogo } from '@/components/brand/BekemLogo';
import { useTableDensity } from '@/hooks/useTableDensity';
import { useNavbarContext } from '@/hooks/useNavbarContext';
import { RouteErrorBoundary } from '@/components/RouteErrorBoundary';

export function AppShell() {
  const user = useAuthStore((s) => s.user);
  const location = useLocation();
  const navigate = useNavigate();
  const { projectLabel } = useNavbarContext();
  const role = user?.role as UserRole;
  const homePath = role ? getRoleHomePath(role) : '/';
  const [searchOpen, setSearchOpen] = useState(false);
  const { density, toggle: toggleDensity } = useTableDensity();

  const hideNav =
    location.pathname.includes('/allocate') ||
    location.pathname.includes('/forward') ||
    location.pathname.includes('/executive/po/new') ||
    location.pathname.includes('/executive/rfq/new');

  const normalizedPath = location.pathname.replace(/\/+$/, '') || '/';
  const homeNormalized = (homePath || '/').replace(/\/+$/, '') || '/';
  const isRoleHome =
    normalizedPath === homeNormalized || normalizedPath === '/' || normalizedPath === '/login';
  const showGlobalBack = !hideNav && !isRoleHome;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const { data: notifications } = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      const res = await api.get<{ data: NotificationDto[] }>('/notifications');
      return res.data.data;
    },
    refetchInterval: 30000,
  });

  const unread = notifications?.filter((n) => !n.isRead).length || 0;

  const roleBadgeClass =
    role === UserRole.CHAIRMAN
      ? 'text-gold-dark bg-gold-light border border-gold/25 px-2 py-0.5 rounded-md text-xs font-semibold'
      : 'text-bekem-accent font-medium';

  return (
    <div className="min-h-screen flex bg-white">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[200] focus:px-4 focus:py-2 focus:bg-white focus:rounded-lg focus:border focus:border-surface-border"
      >
        Skip to content
      </a>
      <AccessDeniedToast />
      <CommandPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
      {!hideNav && <AppSidebar unread={unread} />}

      <div className="flex-1 flex flex-col min-w-0">
        {!hideNav && user && (
          <header className="sticky top-0 z-30 shrink-0 border-b border-surface-border bg-white">
            <div className="hidden lg:flex h-10 items-center justify-between px-3">
              <div className="flex items-center gap-2.5 min-w-0">
                {showGlobalBack && (
                  <button
                    type="button"
                    onClick={() => {
                      if (window.history.length > 1) navigate(-1);
                      else navigate(homePath);
                    }}
                    className="h-8 w-8 shrink-0 flex items-center justify-center rounded-lg border border-transparent text-ink-secondary hover:text-ink hover:bg-surface-muted hover:border-surface-border"
                    aria-label="Go back"
                    title="Go back"
                  >
                    <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
                  </button>
                )}
                <p className="text-sm text-ink-secondary truncate">
                  {projectLabel ? (
                    <span className="font-semibold text-ink">{projectLabel}</span>
                  ) : (
                    <span className="font-semibold text-ink">Bekem OS</span>
                  )}
                  <span className="mx-2 text-ink-muted">·</span>
                  <span className={roleBadgeClass}>{roleDisplayLabel(role)}</span>
                </p>
              </div>
              <div className="flex items-center gap-3">
                <SearchTrigger onClick={() => setSearchOpen(true)} />
                <button
                  type="button"
                  onClick={toggleDensity}
                  className="flex h-8 items-center gap-1.5 rounded-lg border border-transparent px-2 text-xs font-medium text-ink-secondary hover:text-ink hover:bg-surface-muted hover:border-surface-border transition-colors"
                  aria-label={`Table density: ${density}. Click to toggle.`}
                  title={`Table density: ${density} (toggle)`}
                >
                  <Rows3 className="h-4 w-4" strokeWidth={1.75} />
                  <span className="hidden xl:inline">{density === 'compact' ? 'Compact' : 'Comfortable'}</span>
                </button>
                <NavLink
                  to="/notifications"
                  className="relative flex h-8 w-8 items-center justify-center rounded-lg border border-transparent text-ink-secondary hover:text-ink hover:bg-surface-muted hover:border-surface-border transition-colors duration-200"
                  aria-label={`Notifications${unread > 0 ? `, ${unread} unread` : ''}`}
                >
                  <Bell className="h-4 w-4" strokeWidth={1.75} />
                  {unread > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-bekem-accent text-white text-[10px] font-bold flex items-center justify-center">
                      {unread > 9 ? '9+' : unread}
                    </span>
                  )}
                </NavLink>
              </div>
            </div>

            <div className="lg:hidden flex h-10 items-center gap-2 px-2.5">
              {showGlobalBack ? (
                <button
                  type="button"
                  onClick={() => {
                    if (window.history.length > 1) navigate(-1);
                    else navigate(homePath);
                  }}
                  className="h-9 w-9 shrink-0 flex items-center justify-center rounded-lg border border-surface-border text-ink-secondary"
                  aria-label="Go back"
                >
                  <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
                </button>
              ) : (
                <BekemLogo size="sm" className="shrink-0" />
              )}
              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                className="flex-1 flex items-center gap-2 h-8 px-2.5 rounded-lg border border-surface-border bg-surface-muted/60 text-xs text-ink-muted"
                aria-label="Open search"
              >
                <Search className="h-4 w-4 shrink-0" />
                <span className="truncate">Search…</span>
              </button>
              <NavLink
                to="/notifications"
                className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-surface-border text-ink-secondary"
                aria-label={`Notifications${unread > 0 ? `, ${unread} unread` : ''}`}
              >
                <Bell className="h-4 w-4" strokeWidth={1.75} />
                {unread > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-bekem-accent text-white text-[9px] font-bold flex items-center justify-center">
                    {unread > 9 ? '9+' : unread}
                  </span>
                )}
              </NavLink>
            </div>
          </header>
        )}

        <main
          id="main-content"
          className={cn('flex-1 overflow-y-auto w-full', hideNav ? 'pb-4' : 'pb-20 lg:pb-8')}
        >
          <div className="w-full max-w-full px-2.5 sm:px-3 lg:px-4 py-0.5">
            <RouteErrorBoundary resetKey={location.pathname}>
              <Outlet />
            </RouteErrorBoundary>
          </div>
        </main>

        {!hideNav && role && (
          <MobileNav
            role={role}
            homePath={homePath}
            unread={unread}
            isSystemAdmin={!!user?.isSystemAdmin}
          />
        )}
      </div>
    </div>
  );
}
