import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ShoppingCart, ChevronRight, AlertTriangle, FileText, FileBarChart2, HardHat, FilePlus } from 'lucide-react';
import { getGreeting, formatCurrency } from '@afios/shared';
import type { DeliveryAlertDto, ExecutiveDashboardDto, PurchaseOrderDto, WorkOrderDto } from '@afios/shared';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/EmptyState';
import { ListQueryBoundary } from '@/components/ListQueryBoundary';
import { PaginationBar } from '@/components/ui/PaginationBar';
import { PageHeader } from '@/components/layout/PageHeader';
import { DashboardSearch } from '@/components/layout/DashboardSearch';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { DashboardWidgetCards } from '@/components/DashboardWidgetCards';
import { FulfillmentStatusChip } from '@/components/FulfillmentStatusChip';
import { PoEmailStatusChip } from '@/components/PoEmailStatusChip';
import { TodayPanel } from '@/components/layout/TodayPanel';
import { useTodayActions } from '@/hooks/useTodayActions';
import { ActionCard } from '@/components/ui/ActionCard';

export function ExecutiveHomePage() {
  const navigate = useNavigate();
  const [projectFilter, setProjectFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [projectPage, setProjectPage] = useState(1);
  const { data: today, isLoading: todayLoading } = useTodayActions();

  const {
    data: dashboard,
    isLoading: dashboardLoading,
    isError: dashboardError,
    refetch: refetchDashboard,
    isFetching: dashboardFetching,
  } = useQuery({
    queryKey: ['executive-dashboard', projectPage, projectFilter],
    queryFn: async () => {
      const res = await api.get<{ data: ExecutiveDashboardDto }>('/dashboard/executive', {
        params: {
          page: projectPage,
          limit: 20,
          ...(projectFilter.trim() ? { q: projectFilter.trim() } : {}),
        },
      });
      return res.data.data;
    },
  });

  const {
    data: widgets,
    isLoading: widgetsLoading,
  } = useQuery({
    queryKey: ['dashboard-widgets'],
    queryFn: async () => {
      const res = await api.get<{ data: import('@afios/shared').DashboardWidgetsDto }>(
        '/dashboard/widgets'
      );
      return res.data.data;
    },
  });

  const { data: deliveryAlerts } = useQuery({
    queryKey: ['delivery-alerts'],
    queryFn: async () => {
      const res = await api.get<{ data: DeliveryAlertDto[] }>('/dashboard/delivery-alerts');
      return res.data.data;
    },
  });

  const {
    data: pendingPos,
    isLoading: pendingPosLoading,
    isError: pendingPosError,
    refetch: refetchPendingPos,
    isFetching: pendingPosFetching,
  } = useQuery({
    queryKey: ['po-queue-executive', projectFilter, statusFilter],
    queryFn: async () => {
      const res = await api.get<{ data: PurchaseOrderDto[] }>('/purchase-orders', {
        params: { queue: 'executive' },
      });
      return res.data.data ?? [];
    },
  });

  const { data: woReviewQueue } = useQuery({
    queryKey: ['wo-queue-executive'],
    queryFn: async () => {
      const res = await api.get<{ data: WorkOrderDto[] }>('/work-orders', {
        params: { queue: 'executive' },
      });
      return Array.isArray(res.data.data) ? res.data.data : [];
    },
  });
  const woReviewPending = woReviewQueue?.length ?? 0;

  const filteredProjects = useMemo(() => {
    let list = dashboard?.projects ?? [];
    if (statusFilter) {
      list = list.filter((p) => p.status === statusFilter);
    }
    return list;
  }, [dashboard?.projects, statusFilter]);

  const filteredPos = useMemo(() => {
    if (!pendingPos) return [];
    return pendingPos.filter((po) => {
      if (statusFilter && po.status !== statusFilter) return false;
      return true;
    });
  }, [pendingPos, statusFilter]);

  return (
    <div className="page-container">
      <PageHeader
        eyebrow={getGreeting()}
        title="Executive dashboard"
        subtitle="Manage the complete procurement process from one Indents page"
        action={
          <Button
            variant="primary"
            size="lg"
            onClick={() => navigate('/executive/material-indents')}
          >
            <FileText className="h-4 w-4" />
            Open Indents
          </Button>
        }
      />

      <TodayPanel actions={today ?? []} loading={todayLoading} />

      <section className="section-gap">
        <h2 className="section-label mb-3">Process</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <ActionCard
            title="Indents workflow"
            subtitle="Review, decide, create RFQ, create PO, and track fulfillment"
            count={dashboard?.totals.pendingIndentCount ?? 0}
            icon={FileText}
            tone="warning"
            onClick={() => navigate('/executive/material-indents')}
          />
          <ActionCard
            title="Purchase orders"
            subtitle="Track open purchase orders and follow through to fulfillment"
            count={dashboard?.totals.openPoCount ?? 0}
            icon={ShoppingCart}
            tone="success"
            onClick={() => navigate('/executive/purchase-orders')}
          />
          <ActionCard
            title="Review work orders"
            subtitle={woReviewPending > 0 ? 'PM-approved WOs waiting on you' : 'Queue clear'}
            count={woReviewPending}
            icon={HardHat}
            tone="info"
            onClick={() => navigate('/executive/review-wos')}
          />
          <ActionCard
            title="Generate work order"
            subtitle="Create a work order from an approved PO"
            icon={FilePlus}
            tone="neutral"
            onClick={() => navigate('/executive/wo/new')}
          />
          <ActionCard
            title="Reports"
            subtitle="Pipeline, open PO, GRN, AP aging"
            icon={FileBarChart2}
            tone="info"
            onClick={() => navigate('/executive/reports')}
          />
        </div>
      </section>

      <DashboardSearch placeholder="Search projects, materials, employees, POs…" />

      {!!deliveryAlerts?.length && (
        <div className="mb-3 rounded-lg border border-danger/25 bg-danger-light px-3 py-2 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-danger shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-danger-dark">Pending delivery overdue</p>
            <p className="text-sm text-danger-dark/90 mt-1">
              {deliveryAlerts.length} PO{deliveryAlerts.length > 1 ? 's' : ''} past expected delivery
              date without receipt — check notifications for details.
            </p>
          </div>
        </div>
      )}

      <DashboardWidgetCards widgets={widgets?.widgets} loading={widgetsLoading} />

      <div className="flex flex-wrap gap-3 mb-3">
        <input
          type="search"
          placeholder="Filter projects by code or name…"
          value={projectFilter}
          onChange={(e) => {
            setProjectFilter(e.target.value);
            setProjectPage(1);
          }}
          className="rounded-lg border border-surface-border px-3 py-2 text-sm min-w-[200px] flex-1 max-w-xs"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-surface-border px-3 py-2 text-sm bg-white"
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="ON_HOLD">On hold</option>
          <option value="DRAFT">Draft POs</option>
          <option value="COORDINATOR_PENDING">Coordinator pending</option>
        </select>
      </div>

      <ListQueryBoundary
        isLoading={dashboardLoading}
        isError={dashboardError}
        onRetry={() => refetchDashboard()}
        retrying={dashboardFetching && !dashboardLoading}
        skeletonRows={6}
        empty={<></>}
      >
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <div className="panel p-3">
              <p className="text-xs text-ink-muted uppercase tracking-wide">Projects</p>
              <p className="text-2xl font-bold mt-1">{dashboard?.totals.projectCount ?? 0}</p>
            </div>
            <div className="panel p-3">
              <p className="text-xs text-ink-muted uppercase tracking-wide">Open POs</p>
              <p className="text-2xl font-bold mt-1">{dashboard?.totals.openPoCount ?? 0}</p>
            </div>
            <div className="panel p-3">
              <p className="text-xs text-ink-muted uppercase tracking-wide">Open PRs</p>
              <p className="text-2xl font-bold mt-1">{dashboard?.totals.openPrCount ?? 0}</p>
            </div>
            <div className="panel p-3">
              <p className="text-xs text-ink-muted uppercase tracking-wide">Pending indents</p>
              <p className="text-2xl font-bold mt-1">{dashboard?.totals.pendingIndentCount ?? 0}</p>
            </div>
          </div>

          <h2 className="section-label mb-4">Project overview</h2>
          {!filteredProjects.length ? (
            <EmptyState title="No projects match filters" description="Clear filters to see all projects." />
          ) : (
            <>
              <div className="table-shell mb-4">
                <table className="data-table min-w-[72rem]">
                  <thead>
                    <tr>
                      <th>Code</th>
                      <th>Project</th>
                      <th>Location</th>
                      <th>Status</th>
                      <th className="num">Open POs</th>
                      <th className="num">Open PRs</th>
                      <th className="num">Indents</th>
                      <th className="num">PO Value</th>
                      <th className="num">Health</th>
                      <th className="num">Budget</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProjects.map((p) => (
                      <tr
                        key={p.id}
                        className="cursor-pointer"
                        onClick={() => navigate(`/admin/projects`)}
                      >
                        <td className="cell-code whitespace-nowrap">{p.code}</td>
                        <td className="cell-text">{p.name}</td>
                        <td className="cell-text">{p.location || '—'}</td>
                        <td><StatusBadge status={p.status} /></td>
                        <td className="num tabular-nums">{p.openPoCount}</td>
                        <td className="num tabular-nums">{p.openPrCount}</td>
                        <td className="num tabular-nums">{p.pendingIndentCount}</td>
                        <td className="num tabular-nums whitespace-nowrap">{formatCurrency(p.openPoValue)}</td>
                        <td className="num tabular-nums">{p.healthScore ?? '—'}{p.healthScore != null ? '%' : ''}</td>
                        <td className="num tabular-nums">{p.deployPct ?? '—'}{p.deployPct != null ? '%' : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {dashboard?.pagination && (
                <PaginationBar
                  pagination={dashboard.pagination}
                  onPageChange={setProjectPage}
                  className="mb-10"
                />
              )}
            </>
          )}
        </>
      </ListQueryBoundary>

      <section>
        <h2 className="section-label mb-4">Pending purchase orders</h2>
        <ListQueryBoundary
          isLoading={pendingPosLoading}
          isError={pendingPosError}
          onRetry={() => refetchPendingPos()}
          retrying={pendingPosFetching && !pendingPosLoading}
          isEmpty={!filteredPos?.length}
          skeletonRows={3}
          empty={
            <EmptyState
              celebrate
              title="No pending POs"
              description="Create a PO when a purchase request is ready."
            />
          }
        >
          <div className="table-shell">
            <table className="data-table min-w-[64rem]">
              <thead>
                <tr>
                  <th>PO No</th>
                  <th>Vendor</th>
                  <th className="num">Amount</th>
                  <th>Status</th>
                  <th>Fulfillment</th>
                  <th>Email</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {filteredPos.map((po) => (
                  <tr
                    key={po.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/purchase-orders/${po.id}`)}
                  >
                    <td className="cell-code whitespace-nowrap">{po.poNumber || po.draftRef || 'Draft PO'}</td>
                    <td className="cell-text">{po.vendor?.name ?? 'Vendor TBD'}</td>
                    <td className="num tabular-nums whitespace-nowrap">{formatCurrency(po.amount)}</td>
                    <td><StatusBadge status={po.status} /></td>
                    <td>{po.fulfillmentStatus && po.status === 'APPROVED' ? <FulfillmentStatusChip status={po.fulfillmentStatus} /> : '—'}</td>
                    <td>{po.status === 'APPROVED' && po.emailStatus ? <PoEmailStatusChip status={po.emailStatus} sentAt={po.emailSentAt} /> : '—'}</td>
                    <td className="text-right"><ChevronRight className="h-4 w-4 text-ink-muted inline-block" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ListQueryBoundary>
      </section>
    </div>
  );
}
