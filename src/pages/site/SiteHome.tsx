import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Package,
  ChevronRight,
  Clock,
  XCircle,
  CheckCircle2,
  ClipboardCheck,
  FileBarChart2,
} from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate, getGreeting } from '@afios/shared';
import type { MaterialRequestDto } from '@afios/shared';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { formatIndentQueueStatus } from '@/components/MaterialIndentsTable';
import { EmptyState } from '@/components/EmptyState';
import { ListQueryBoundary } from '@/components/ListQueryBoundary';
import { ActionCard } from '@/components/ui/ActionCard';
import { TodayPanel } from '@/components/layout/TodayPanel';
import { PageHeader } from '@/components/layout/PageHeader';
import { useTodayActions } from '@/hooks/useTodayActions';
import { useListQuery, normalizeListData } from '@/hooks/useListQuery';
import { Button } from '@/components/ui/Button';

export function SiteHomePage() {
  const navigate = useNavigate();
  const { data: today, isLoading: todayLoading } = useTodayActions();

  const { data: requests, list: requestsList } = useListQuery({
    queryKey: ['material-requests'],
    queryFn: async () => {
      const res = await api.get<{ data: MaterialRequestDto[] }>('/material-requests');
      return normalizeListData<MaterialRequestDto>(res.data.data);
    },
  });

  const awaitingVerify = (requests ?? []).filter((r) => r.status === 'ISSUED');
  const pending =
    requests?.filter((r) => !['COMPLETED', 'CLOSED', 'REJECTED', 'CANCELLED'].includes(r.status))
      .length || 0;
  const rejected = requests?.filter((r) => r.status === 'REJECTED').length || 0;
  const completed =
    requests?.filter((r) => ['COMPLETED', 'CLOSED'].includes(r.status)).length || 0;
  const recent = requests?.slice(0, 5) || [];

  /** Drop today actions already covered by the verify section / sidebar. */
  const todayActions = useMemo(() => {
    const skip = new Set(['site-collect-verify', 'site-new-indent', 'notifications']);
    return (today ?? []).filter((a) => {
      if (skip.has(a.id)) return false;
      if (awaitingVerify.length > 0 && /collect|verif/i.test(`${a.title} ${a.subtitle || ''}`)) {
        return false;
      }
      return true;
    });
  }, [today, awaitingVerify.length]);

  return (
    <div className="page-container">
      <PageHeader
        eyebrow={getGreeting()}
        title="Dashboard"
        subtitle="Site material requests and indents"
      />

      <TodayPanel actions={todayActions} loading={todayLoading} />

      {awaitingVerify.length > 0 && (
        <section className="section-gap panel overflow-hidden border-2 border-bekem-accent/40">
          <div className="px-3 py-3 sm:px-4 bg-bekem-accent-soft/40 border-b border-bekem-accent/20 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <ClipboardCheck className="h-4 w-4 text-bekem-accent shrink-0" />
                <h2 className="text-sm font-semibold text-ink">Stock collection & verification</h2>
              </div>
              <p className="text-xs text-ink-secondary mt-0.5">
                Store issued material — collect at site and confirm receipt to complete the indent
              </p>
            </div>
            <span className="inline-flex self-start sm:self-auto items-center rounded-full bg-bekem-accent text-white text-[11px] font-bold px-2.5 py-0.5 tabular-nums">
              {awaitingVerify.length} to verify
            </span>
          </div>
          <ul className="divide-y divide-surface-border">
            {awaitingVerify.map((r) => (
              <li
                key={r.id}
                className="px-3 py-3 sm:px-4 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3"
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => navigate(`/requests/${r.id}`)}
                >
                  <p className="font-mono text-xs font-semibold text-ink">{r.indentNumber}</p>
                  <p className="text-sm text-ink-secondary truncate">{r.purpose || 'Material issued'}</p>
                  <p className="text-[11px] text-ink-muted mt-0.5">{formatDate(r.createdAt)}</p>
                </button>
                <Button
                  size="sm"
                  variant="accent"
                  className="shrink-0 self-start sm:self-auto"
                  onClick={() => navigate(`/requests/${r.id}`)}
                >
                  Collect & verify
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 section-gap">
        <ActionCard
          title="Pending"
          count={pending}
          icon={Clock}
          tone="warning"
          onClick={() => navigate('/incidents?tab=pending')}
        />
        <ActionCard
          title="Completed"
          count={completed}
          icon={CheckCircle2}
          tone="success"
          onClick={() => navigate('/incidents?tab=completed')}
        />
        <ActionCard
          title="Rejected"
          count={rejected}
          icon={XCircle}
          tone="danger"
          onClick={() => navigate('/incidents?tab=rejected')}
        />
        <ActionCard
          title="All"
          count={requests?.length || 0}
          icon={Package}
          tone="info"
          onClick={() => navigate('/incidents?tab=all')}
        />
        <ActionCard
          title="Reports"
          subtitle="Indent aging & MIS"
          icon={FileBarChart2}
          tone="neutral"
          onClick={() => navigate('/site/reports')}
        />
      </div>

      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="section-label">Recent requests</h2>
          <button
            onClick={() => navigate('/incidents')}
            className="text-sm font-semibold text-bekem-accent hover:underline"
          >
            View all
          </button>
        </div>

        <ListQueryBoundary
          isLoading={requestsList.isLoading}
          isError={requestsList.isError}
          onRetry={requestsList.onRetry}
          retrying={requestsList.retrying}
          isEmpty={recent.length === 0}
          skeletonRows={4}
          empty={
            <EmptyState
              celebrate
              title="No pending requests"
              description="Everything is completed. Create a new indent when you need materials."
            />
          }
        >
          <div className="table-shell">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Indent Number</th>
                  <th>Indent Date</th>
                  <th>Purpose</th>
                  <th>Status</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {recent.map((r) => (
                  <tr
                    key={r.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/requests/${r.id}`)}
                  >
                    <td className="cell-code whitespace-nowrap">{r.indentNumber}</td>
                    <td className="whitespace-nowrap">{formatDate(r.createdAt)}</td>
                    <td className="cell-text max-w-[14rem]">{r.purpose || '—'}</td>
                    <td>
                      <StatusBadge
                        status={r.status}
                        label={formatIndentQueueStatus(
                          r.status,
                          r.pendingWith,
                          r.approverNames,
                          r.poStatus
                        )}
                      />
                    </td>
                    <td className="text-right">
                      <ChevronRight className="h-4 w-4 text-ink-muted inline-block" />
                    </td>
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
