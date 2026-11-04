import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ClipboardCheck, FileText, Bell, ChevronRight, ShoppingCart, ArrowLeftRight, Search, FileBarChart2, HardHat } from 'lucide-react';
import { api } from '@/lib/api';
import { approvalCapDayKey } from '@/lib/approvalCapDay';
import { useAuthStore } from '@/stores/authStore';
import { getGreeting, getFirstName } from '@afios/shared';
import type { PmDashboardDto, WorkOrderDto } from '@afios/shared';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { PageHeader } from '@/components/layout/PageHeader';
import { ActionCard } from '@/components/ui/ActionCard';
import { PmDailyCapBanner } from '@/components/PmDailyCapBanner';
import { TodayPanel } from '@/components/layout/TodayPanel';
import { RoleDashboardActions } from '@/components/layout/RoleDashboardActions';
import { ListQueryBoundary } from '@/components/ListQueryBoundary';
import { useTodayActions } from '@/hooks/useTodayActions';

export function PMHomePage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user)!;
  const { data: today, isLoading: todayLoading } = useTodayActions();

  const {
    data: dashboard,
    isLoading: dashboardLoading,
    isError: dashboardError,
    refetch: refetchDashboard,
    isFetching: dashboardFetching,
  } = useQuery({
    queryKey: ['pm-dashboard', approvalCapDayKey()],
    queryFn: async () => {
      const res = await api.get<{ data: PmDashboardDto }>('/dashboard/pm');
      return res.data.data;
    },
  });

  const approvalCount = dashboard?.approveQueue.length ?? 0;
  const purchaseCount = dashboard?.purchaseRequests.length ?? 0;
  const pendingCount = dashboard?.pendingRequests.length ?? 0;
  const unread = dashboard?.notifications.filter((n) => !n.isRead).length ?? 0;

  const { data: woQueue } = useQuery({
    queryKey: ['wo-queue-pm'],
    queryFn: async () => {
      const res = await api.get<{ data: WorkOrderDto[] }>('/work-orders', {
        params: { queue: 'pm' },
      });
      return Array.isArray(res.data.data) ? res.data.data : [];
    },
  });
  const woPending = woQueue?.length ?? 0;

  return (
    <div className="page-container">
      <PageHeader
        eyebrow={getGreeting()}
        title={getFirstName(user.name)}
        subtitle="Material requests and approvals for your project"
      />

      <RoleDashboardActions title="Project decisions" description="Review requests from Store or check material availability before a decision." actions={[
        { label: 'Review indents', description: 'Open requests forwarded by Store', to: '/pm/material-indents?tab=pending&queue=approved-store' },
        { label: 'Search materials', description: 'Check stock and procurement options', to: '/pm/material-lookup' },
        { label: 'Branch transfer requests', description: 'Track transfers between projects', to: '/pm/branch-transfer-requests' },
      ]} />
      <TodayPanel actions={today ?? []} loading={todayLoading} />

      <PmDailyCapBanner cap={dashboard?.dailyCap} />

      <div className="flex flex-col sm:flex-row gap-3 section-gap">
        <button
          type="button"
          onClick={() => navigate('/pm/material-lookup')}
          className="flex-1 panel p-3 text-left border-2 border-bekem-accent/40 bg-bekem-accent-soft/40 hover:bg-bekem-accent-soft/60 transition-colors"
        >
          <div className="flex items-center gap-2.5">
            <ShoppingCart className="h-4 w-4 text-bekem-accent shrink-0" />
            <div>
              <p className="font-semibold text-ink">New procurement</p>
              <p className="text-xs text-ink-secondary mt-0.5">Search materials and request purchase</p>
            </div>
          </div>
        </button>
        <button
          type="button"
          onClick={() => navigate('/pm/material-lookup?action=branch-transfer')}
          className="flex-1 panel p-3 text-left hover:border-bekem-accent/30 transition-colors"
        >
          <div className="flex items-center gap-2.5">
            <ArrowLeftRight className="h-4 w-4 text-ink-muted shrink-0" />
            <div>
              <p className="font-semibold text-ink">Branch transfer</p>
              <p className="text-xs text-ink-secondary mt-0.5">Move stock between your projects</p>
            </div>
          </div>
        </button>
        <button
          type="button"
          aria-label="Search materials"
          onClick={() => navigate('/pm/material-lookup')}
          className="sm:w-auto panel px-3 py-3 text-left hover:border-bekem-accent/30 transition-colors"
        >
          <Search className="h-4 w-4 text-bekem-accent" />
        </button>
      </div>

      <section aria-labelledby="pm-queues-heading" className="section-gap">
      <h2 id="pm-queues-heading" className="mb-1 text-sm font-semibold text-ink">Requests and approvals</h2>
      <p className="mb-3 text-xs text-ink-secondary">Choose a queue to see the requests and actions available to you.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <ActionCard
          title="Pending material requests"
          count={pendingCount}
          subtitle="Raised by site, awaiting store"
          icon={FileText}
          tone="primary"
          onClick={() => navigate('/requests')}
        />
        <ActionCard
          title="Approve requests"
          count={approvalCount}
          subtitle="Forwarded from store"
          icon={ClipboardCheck}
          tone="warning"
          onClick={() => navigate('/pm/material-indents?tab=pending&queue=approved-store')}
        />
        <ActionCard
          title="Purchase orders"
          count={purchaseCount}
          subtitle="All POs for your projects"
          icon={ShoppingCart}
          tone="success"
          onClick={() => navigate('/pm/purchase-orders')}
        />
        <ActionCard
          title="Approve work orders"
          count={woPending}
          subtitle={woPending > 0 ? 'Waiting on PM approval' : 'Queue clear'}
          icon={HardHat}
          tone="info"
          onClick={() => navigate('/pm/approve-wos')}
        />
        <ActionCard
          title="Notifications"
          count={unread}
          subtitle="Alerts and updates"
          icon={Bell}
          tone="primary"
          onClick={() => navigate('/notifications')}
        />
        <ActionCard
          title="Reports"
          subtitle="Indent aging, stock, project cost"
          icon={FileBarChart2}
          tone="info"
          onClick={() => navigate('/pm/reports')}
        />
      </div>
      </section>

      <ListQueryBoundary
        isLoading={dashboardLoading}
        isError={dashboardError}
        onRetry={() => refetchDashboard()}
        retrying={dashboardFetching && !dashboardLoading}
        skeletonRows={4}
        empty={<></>}
      >
      {approvalCount > 0 ? (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="section-label">Approve requests</h2>
            <button
              onClick={() => navigate('/pm/material-indents?tab=pending&queue=approved-store')}
              className="text-sm font-semibold text-bekem-accent hover:underline"
            >
              View all
            </button>
          </div>
          <div className="table-shell">
            <table className="data-table">
              <caption className="sr-only">Indents awaiting project manager review</caption>
              <thead>
                <tr>
                  <th>Indent</th>
                  <th>Material</th>
                  <th>Status</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {dashboard?.approveQueue.slice(0, 5).map((r) => (
                  <tr
                    key={r.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/requests/${r.id}`)}
                  >
                    <td className="font-semibold"><button type="button" className="min-h-[44px] text-left underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-bekem-accent" onClick={(event) => { event.stopPropagation(); navigate(`/requests/${r.id}`); }}>{r.indentNumber}</button></td>
                    <td className="text-ink-secondary">
                      {r.material?.name || r.items?.[0]?.material?.name}
                    </td>
                    <td>
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="text-right">
                      <ChevronRight className="h-4 w-4 text-ink-muted inline-block" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : <p className="text-sm text-ink-secondary">No requests are currently awaiting your review.</p>}
      </ListQueryBoundary>
    </div>
  );
}
