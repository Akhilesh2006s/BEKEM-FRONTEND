import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Package,
  ChevronRight,
  Clock,
  XCircle,
  CheckCircle2,
  ClipboardCheck,
  FileBarChart2,
  FilePlus2,
  ListChecks,
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
        subtitle="Create a material request and follow it through to delivery."
      />

      <section aria-label="Quick actions" className="section-gap rounded-lg border border-bekem-accent/20 bg-bekem-accent-soft/40 p-4 sm:p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-bekem-accent">Your site requests</p>
        <h2 className="mt-1 text-lg font-bold text-ink">What would you like to do?</h2>
        <p className="mt-1 text-sm text-ink-secondary">Raise a new indent for materials or check the progress of an existing one.</p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Link to="/request/new" className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-bekem-accent px-4 py-2.5 text-sm font-semibold text-white hover:bg-bekem-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bekem-accent"><FilePlus2 className="h-4 w-4" aria-hidden="true" /> New indent</Link>
          <Link to="/incidents" className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-bekem-accent/40 bg-white px-4 py-2.5 text-sm font-semibold text-bekem-accent hover:bg-bekem-accent-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bekem-accent"><ListChecks className="h-4 w-4" aria-hidden="true" /> My indents</Link>
        </div>
      </section>

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

      <section aria-labelledby="request-status-heading" className="section-gap">
      <div className="mb-2"><h2 id="request-status-heading" className="text-sm font-semibold text-ink">Request status</h2><p className="mt-1 text-xs text-ink-secondary">Select a status to see the matching indents.</p></div>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
        <ActionCard
          title="Pending"
          count={requestsList.isError ? '—' : requestsList.isLoading ? '…' : pending}
          icon={Clock}
          tone="warning"
          onClick={() => navigate('/incidents?tab=pending')}
        />
        <ActionCard
          title="Completed"
          count={requestsList.isError ? '—' : requestsList.isLoading ? '…' : completed}
          icon={CheckCircle2}
          tone="success"
          onClick={() => navigate('/incidents?tab=completed')}
        />
        <ActionCard
          title="Rejected"
          count={requestsList.isError ? '—' : requestsList.isLoading ? '…' : rejected}
          icon={XCircle}
          tone="danger"
          onClick={() => navigate('/incidents?tab=rejected')}
        />
        <ActionCard
          title="All"
          count={requestsList.isError ? '—' : requestsList.isLoading ? '…' : requests?.length || 0}
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
      {requestsList.isLoading && <p className="mt-2 text-sm text-ink-secondary" role="status">Loading request counts…</p>}
      {requestsList.isError && <p className="mt-2 text-sm text-red-700" role="alert">Request counts could not be loaded. <button type="button" className="min-h-[44px] font-semibold underline focus-visible:outline focus-visible:outline-2" onClick={requestsList.onRetry}>Try again</button></p>}
      </section>

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
              title="No recent requests"
              description="When you create an indent, it will appear here."
            />
          }
        >
          <>
          <ul className="space-y-2 sm:hidden" aria-label="Recent requests">
            {recent.map((r) => (
              <li key={r.id} className="rounded-lg border border-surface-border bg-white p-3">
                <Link to={`/requests/${r.id}`} className="inline-flex min-h-[44px] items-center font-mono text-sm font-semibold text-bekem-accent underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bekem-accent">{r.indentNumber}</Link>
                <p className="text-sm text-ink">{r.purpose || 'No purpose provided'}</p>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2"><span className="text-xs text-ink-secondary">{formatDate(r.createdAt)}</span><StatusBadge status={r.status} label={formatIndentQueueStatus(r.status, r.pendingWith, r.approverNames, r.poStatus, r.pmProceededAllocation, r.allocationReviewStage, r.allocatedByRole)} /></div>
              </li>
            ))}
          </ul>
          <div className="table-shell hidden sm:block">
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
                    <td className="cell-code whitespace-nowrap"><Link to={`/requests/${r.id}`} onClick={(event) => event.stopPropagation()} className="inline-flex min-h-[44px] items-center underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bekem-accent">{r.indentNumber}</Link></td>
                    <td className="whitespace-nowrap">{formatDate(r.createdAt)}</td>
                    <td className="cell-text max-w-[14rem]">{r.purpose || '—'}</td>
                    <td>
                      <StatusBadge
                        status={r.status}
                        label={formatIndentQueueStatus(
                          r.status,
                          r.pendingWith,
                          r.approverNames,
                          r.poStatus,
                          r.pmProceededAllocation,
                          r.allocationReviewStage,
                          r.allocatedByRole
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
          </>
        </ListQueryBoundary>
      </section>
    </div>
  );
}
