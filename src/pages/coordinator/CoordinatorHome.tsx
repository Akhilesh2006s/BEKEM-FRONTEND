import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ClipboardCheck, HardHat, FileText, FileBarChart2 } from 'lucide-react';
import { getGreeting } from '@afios/shared';
import type { PurchaseOrderDto, WorkOrderDto, MaterialRequestDto, GrnHoldQueueItemDto } from '@afios/shared';
import { api } from '@/lib/api';
import { EmptyState } from '@/components/EmptyState';
import { ListQueryBoundary } from '@/components/ListQueryBoundary';
import { PageHeader } from '@/components/layout/PageHeader';
import { ActionCard } from '@/components/ui/ActionCard';
import { TodayPanel } from '@/components/layout/TodayPanel';
import { DashboardSearch } from '@/components/layout/DashboardSearch';
import { DashboardWidgetCards } from '@/components/DashboardWidgetCards';
import { useTodayActions } from '@/hooks/useTodayActions';
import { useListQuery, normalizeListData } from '@/hooks/useListQuery';
import { CoordinatorDailyCapBanner } from '@/components/PmDailyCapBanner';

export function CoordinatorHomePage() {
  const navigate = useNavigate();
  const { data: today, isLoading: todayLoading } = useTodayActions();

  const { data: widgets, isLoading: widgetsLoading } = useQuery({
    queryKey: ['dashboard-widgets'],
    queryFn: async () => {
      const res = await api.get<{ data: import('@afios/shared').DashboardWidgetsDto }>(
        '/dashboard/widgets'
      );
      return res.data.data;
    },
  });

  const { data: queueResult, list: queueList } = useListQuery({
    queryKey: ['po-queue-coordinator'],
    queryFn: async () => {
      const res = await api.get<{ data: PurchaseOrderDto[]; meta?: { count: number } }>(
        '/purchase-orders',
        { params: { queue: 'coordinator' } }
      );
      const items = normalizeListData<PurchaseOrderDto>(res.data.data);
      return {
        items,
        count: res.data.meta?.count ?? items.length,
      };
    },
  });

  const { data: woQueue, list: woQueueList } = useListQuery({
    queryKey: ['wo-queue-coordinator'],
    queryFn: async () => {
      const res = await api.get<{ data: WorkOrderDto[] }>('/work-orders', {
        params: { queue: 'coordinator' },
      });
      return normalizeListData<WorkOrderDto>(res.data.data);
    },
  });

  const { data: procurementQueue } = useQuery({
    queryKey: ['procurement-decisions', 'coordinator'],
    queryFn: async () => {
      const res = await api.get<{ data: unknown[] }>('/procurement-decisions');
      return Array.isArray(res.data.data) ? res.data.data : [];
    },
  });

  const { data: coordinatorIndents } = useQuery({
    queryKey: ['material-requests', 'coordinator-pending-chip'],
    queryFn: async () => {
      const res = await api.get<{ data: MaterialRequestDto[] }>('/material-requests', {
        params: { tab: 'pending' },
      });
      return normalizeListData<MaterialRequestDto>(res.data.data);
    },
  });

  const { data: grnHoldQueue } = useQuery({
    queryKey: ['grn-hold-queue', 'coordinator'],
    queryFn: async () => {
      const res = await api.get<{ data: GrnHoldQueueItemDto[] }>('/goods-receipts/hold-queue');
      return res.data.data || [];
    },
  });

  const pending = queueResult?.count ?? queueResult?.items?.length ?? 0;
  const woPending = (woQueue?.length ?? 0) + (grnHoldQueue?.length ?? 0);
  const decisionPending = procurementQueue?.length ?? 0;
  const indentsNeedingCoord =
    coordinatorIndents?.filter((r) => r.pendingWith === 'COORDINATOR').length ?? 0;
  const totalPending = pending + woPending + decisionPending;

  return (
    <div className="page-container">
      <PageHeader
        eyebrow={getGreeting()}
        title="Today's approvals"
        subtitle="POs, procurement decisions, and work orders awaiting Coordinator"
      />

      <TodayPanel actions={today ?? []} loading={todayLoading} />

      <CoordinatorDailyCapBanner />

      <DashboardSearch placeholder="Search POs, work orders, indents…" />

      <DashboardWidgetCards widgets={widgets?.widgets} loading={widgetsLoading} />

      <ListQueryBoundary
        isLoading={queueList.isLoading || woQueueList.isLoading}
        isError={queueList.isError || woQueueList.isError}
        onRetry={() => {
          queueList.onRetry();
          woQueueList.onRetry();
        }}
        retrying={queueList.retrying || woQueueList.retrying}
        skeletonRows={2}
        empty={<></>}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 section-gap">
          <ActionCard
            title="Pending PO approval"
            count={pending}
            subtitle={pending > 0 ? 'Awaiting your PO verification' : 'Queue clear'}
            icon={ClipboardCheck}
            tone="primary"
            onClick={() => navigate('/coordinator/verify-pos')}
          />
          <ActionCard
            title="Procurement decisions"
            count={decisionPending}
            subtitle={
              decisionPending > 0
                ? 'Executive PO / branch transfer recommendations'
                : 'No decisions waiting'
            }
            icon={FileText}
            tone="warning"
            onClick={() => navigate('/coordinator/procurement-decisions')}
          />
          <ActionCard
            title="Pending work orders"
            count={woPending}
            subtitle={woPending > 0 ? 'WO and GRN verification required' : 'Queue clear'}
            icon={HardHat}
            tone="info"
            onClick={() => navigate('/coordinator/verify-wos')}
          />
          {indentsNeedingCoord > 0 && (
            <ActionCard
              title="Indents at Coordinator"
              count={indentsNeedingCoord}
              subtitle="Shown as Approved by Coordinator on Executive desk"
              icon={FileText}
              tone="neutral"
              onClick={() => navigate('/coordinator/material-indents?tab=pending&queue=coordinator')}
            />
          )}
          <ActionCard
            title="Reports"
            subtitle="3-way match, AP aging, pipeline, registers"
            icon={FileBarChart2}
            tone="info"
            onClick={() => navigate('/coordinator/reports')}
          />
        </div>

        {totalPending === 0 && indentsNeedingCoord === 0 && (
          <EmptyState
            celebrate
            title="All quiet"
            description="No POs, decisions, or work orders need verification right now."
          />
        )}
      </ListQueryBoundary>
    </div>
  );
}
