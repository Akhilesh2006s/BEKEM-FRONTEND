import { useMemo, useState, useEffect } from 'react';
import { useNavigate, useSearchParams, useLocation, Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { FileText, AlertCircle, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import type { MaterialRequestDto } from '@afios/shared';
import { UserRole } from '@afios/shared';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/EmptyState';
import { normalizeListData } from '@/hooks/useListQuery';
import { cn } from '@/lib/utils';
import { MaterialIndentsTable, isInAllocationReview, isCurrentAllocationOwner } from '@/components/MaterialIndentsTable';
import { IndentListFilters, IndentQueueQuickButtons } from '@/components/IndentListFilters';
import { PmDailyCapBanner } from '@/components/PmDailyCapBanner';
import {
  countIndentQueueFilters,
  filterMaterialIndents,
  getIndentQueueFiltersForRole,
  isIndentQueueFilterId,
  uniqueIndentCategories,
  type IndentDaysFilter,
  type IndentQueueQuickFilter,
} from '@/lib/indentListFilters';

const TABS = [
  { key: 'pending', label: 'Pending' },
  { key: 'completed', label: 'Completed' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'all', label: 'All' },
];

function subtitleForRole(role: UserRole): string {
  switch (role) {
    case UserRole.SITE_INCHARGE:
      return 'Your material requests raised from site';
    case UserRole.PROJECT_MANAGER:
      return 'Indents across your assigned projects — approve, track, and review';
    case UserRole.STORE_INCHARGE:
      return 'Material indents for your store and project';
    case UserRole.EXECUTIVE:
      return 'One place for each indent: decide → create RFQ → collect quotes → create PO';
    case UserRole.COORDINATOR:
      return 'All site material indents — head office view';
    case UserRole.CHAIRMAN:
      return 'Company-wide indent register';
    default:
      return 'Material indents across projects';
  }
}

function titleForRole(role: UserRole): string {
  if ([UserRole.PROJECT_MANAGER, UserRole.EXECUTIVE].includes(role)) return 'Indents';
  return 'Material indents';
}

export function IncidentsPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user)!;
  const role = user.role as UserRole;
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const rawTab = params.get('tab') || 'pending';
  const tab = rawTab === 'approved' ? 'pending' : rawTab;
  const isSite = role === UserRole.SITE_INCHARGE;
  const queueOptions = useMemo(() => getIndentQueueFiltersForRole(role), [role]);

  const search = params.get('q') || '';
  const rawQueue = params.get('queue') || '';
  const queue: IndentQueueQuickFilter | '' =
    rawQueue && isIndentQueueFilterId(rawQueue) ? rawQueue : '';
  const category = params.get('category') || '';
  const days = (params.get('days') as IndentDaysFilter) || '';

  const [localSearch, setLocalSearch] = useState(search);
  useEffect(() => {
    setLocalSearch(search);
  }, [search]);

  const patchParams = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(patch)) {
      if (!value) next.delete(key);
      else next.set(key, value);
    }
    setParams(next);
  };

  const redirectPath =
    role === UserRole.PROJECT_MANAGER && location.pathname === '/incidents'
      ? '/pm/material-indents'
      : role === UserRole.EXECUTIVE && location.pathname === '/incidents'
        ? '/executive/material-indents'
        : role === UserRole.COORDINATOR && location.pathname === '/incidents'
          ? '/coordinator/material-indents'
          : null;

  const { data: requests, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['material-requests', 'indents', tab, role],
    queryFn: async () => {
      const res = await api.get<{ data: MaterialRequestDto[] }>('/material-requests', {
        params: tab === 'all' ? {} : { tab },
      });
      return normalizeListData<MaterialRequestDto>(res.data.data);
    },
    retry: 1,
    enabled: !redirectPath && rawTab !== 'approved',
  });

  /** Chip badges: on All tab count the full list; otherwise open/pending queue. */
  const { data: pendingRequests } = useQuery({
    queryKey: ['material-requests', 'indents', 'pending', role, 'chip-counts'],
    queryFn: async () => {
      const res = await api.get<{ data: MaterialRequestDto[] }>('/material-requests', {
        params: { tab: 'pending' },
      });
      return normalizeListData<MaterialRequestDto>(res.data.data);
    },
    retry: 1,
    enabled: !redirectPath && rawTab !== 'approved',
  });

  const categories = useMemo(() => uniqueIndentCategories(requests ?? []), [requests]);
  const filtered = useMemo(
    () =>
      filterMaterialIndents(requests ?? [], {
        search,
        queue,
        category,
        days,
      }),
    [requests, search, queue, category, days]
  );

  const queueCountSource = tab === 'all' ? requests : pendingRequests ?? requests;
  const queueCounts = useMemo(
    () => countIndentQueueFilters(queueCountSource ?? [], queueOptions),
    [queueCountSource, queueOptions]
  );

  const pendingCount =
    requests?.filter((r) => ['PENDING_STORE', 'FORWARDED_TO_PM'].includes(r.status)).length ?? 0;

  if (rawTab === 'approved') {
    return <Navigate to={`${location.pathname}?tab=pending`} replace />;
  }
  if (redirectPath) {
    return <Navigate to={redirectPath} replace />;
  }

  const errorMessage =
    isError && error && typeof error === 'object' && 'response' in error
      ? (error as { response?: { data?: { message?: string } } }).response?.data?.message
      : null;

  const setSearch = (value: string) => {
    setLocalSearch(value);
    patchParams({ q: value.trim() || undefined });
  };

  const renderProceedAllocation = (request: MaterialRequestDto) => (
    <Button
      variant="primary"
      size="sm"
      onClick={() => navigate(`/requests/${request.id}`)}
    >
      Final review
    </Button>
  );

  const renderExecutiveAction = (request: MaterialRequestDto) => {
    if (['PENDING_HO', 'PENDING_EXECUTIVE_DECISION'].includes(request.status)) {
      return (
        <Button
          variant="primary"
          size="sm"
          onClick={() => navigate(`/executive/procurement-decisions/${request.id}`)}
        >
          Review & decide
        </Button>
      );
    }
    if (request.status === 'EXECUTIVE_DECISION_BRANCH_TRANSFER') {
      return (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => navigate(`/executive/procurement-decisions/${request.id}`)}
        >
          View branch transfer
        </Button>
      );
    }
    if (request.poId) {
      return (
        <div className="flex flex-col items-start gap-1">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => navigate(`/purchase-orders/${request.poId}`)}
          >
            View PO{request.poNumber ? ` ${request.poNumber}` : ''}
          </Button>
          {request.rfqId && (
            <button
              type="button"
              className="text-[11px] font-semibold text-bekem-accent hover:underline"
              onClick={() => navigate(`/rfqs/${request.rfqId}`)}
            >
              View RFQ {request.rfqNumber || ''}
            </button>
          )}
        </div>
      );
    }
    if (request.rfqId && request.rfqStatus === 'FINALIZED' && request.purchaseRequestId) {
      return (
        <div className="flex flex-col items-start gap-1">
          <Button
            variant="primary"
            size="sm"
            onClick={() =>
              navigate(`/executive/po/new?purchaseRequestId=${request.purchaseRequestId}`)
            }
          >
            Create PO from RFQ
          </Button>
          <button
            type="button"
            className="text-[11px] font-semibold text-bekem-accent hover:underline"
            onClick={() => navigate(`/rfqs/${request.rfqId}`)}
          >
            Open RFQ {request.rfqNumber}
          </button>
        </div>
      );
    }
    if (request.rfqId) {
      return (
        <div className="flex flex-col items-start gap-1">
          <Button
            variant="primary"
            size="sm"
            onClick={() => navigate(`/rfqs/${request.rfqId}`)}
          >
            {request.rfqStatus === 'OPEN' ? 'Open RFQ — add quotes' : 'Open RFQ'}
          </Button>
          {request.rfqNumber && (
            <span className="text-[10px] text-ink-muted">{request.rfqNumber}</span>
          )}
        </div>
      );
    }
    if (request.purchaseRequestId) {
      return (
        <div className="flex flex-col items-start gap-1">
          <Button
            variant="primary"
            size="sm"
            onClick={() =>
              navigate(
                `/executive/rfq/new?purchaseRequestId=${request.purchaseRequestId}`
              )
            }
          >
            Create RFQ
          </Button>
          {request.prNumber && (
            <span className="text-[10px] text-ink-muted">From {request.prNumber}</span>
          )}
        </div>
      );
    }
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={() => navigate(`/requests/${request.id}`)}
      >
        View indent
      </Button>
    );
  };

  const renderIndentAction = (request: MaterialRequestDto) => {
    if (isInAllocationReview(request)) {
      if (isCurrentAllocationOwner(request, role)) {
        return renderProceedAllocation(request);
      }
      return (
        <Button variant="ghost" size="sm" onClick={() => navigate(`/requests/${request.id}`)}>
          View indent
        </Button>
      );
    }
    if (role === UserRole.SITE_INCHARGE && request.status === 'ISSUED') {
      return (
        <Button variant="primary" size="sm" onClick={() => navigate(`/requests/${request.id}`)}>
          Collect & verify
        </Button>
      );
    }
    if (role === UserRole.EXECUTIVE) {
      return renderExecutiveAction(request);
    }
    if (role === UserRole.STORE_INCHARGE && request.status === 'PENDING_STORE') {
      return (
        <Button variant="primary" size="sm" onClick={() => navigate(`/store/allocate/${request.id}`)}>
          Review & allocate
        </Button>
      );
    }
    if (
      role === UserRole.PROJECT_MANAGER &&
      ['FORWARDED_TO_PM', 'BRANCH_TRANSFER_REQUESTED'].includes(request.status)
    ) {
      return (
        <Button variant="primary" size="sm" onClick={() => navigate(`/requests/${request.id}`)}>
          Review & decide
        </Button>
      );
    }
    return (
      <Button variant="ghost" size="sm" onClick={() => navigate(`/requests/${request.id}`)}>
        View indent
      </Button>
    );
  };

  return (
    <div className="page-container max-w-full">
      <div className="flex flex-col gap-2 mb-2 lg:mb-3">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-col sm:flex-row sm:items-center sm:flex-wrap gap-2">
              <h1 className="text-base lg:text-lg font-semibold text-ink tracking-tight shrink-0">
                {titleForRole(role)}
              </h1>
              <IndentQueueQuickButtons
                value={queue}
                options={queueOptions}
                counts={queueCounts}
                onChange={(next) => {
                  if (next === 'all') {
                    // Full list across statuses — clear chip filter
                    patchParams({ queue: undefined, tab: 'all' });
                    return;
                  }
                  patchParams({
                    queue: next || undefined,
                    // Status chips apply within the open (pending) queue
                    tab: next ? 'pending' : tab === 'all' ? 'all' : tab,
                  });
                }}
              />
            </div>
            <p className="text-xs text-ink-secondary mt-0.5 max-w-xl">{subtitleForRole(role)}</p>
            {isSite && (
              <p className="text-xs text-ink-muted mt-0.5">Material indents raised from your site</p>
            )}
          </div>
          {isSite && (
            <Button
              variant="primary"
              className="shrink-0 self-start"
              onClick={() => navigate('/request/new')}
            >
              New indent
            </Button>
          )}
        </div>
      </div>

      {role === UserRole.PROJECT_MANAGER && <PmDailyCapBanner />}

      {!isSite && pendingCount > 0 && tab === 'all' && !isError && (
        <div className="mb-3 rounded-lg border border-warning/30 bg-warning-light px-3 py-2.5 flex items-center gap-3">
          <FileText className="h-5 w-5 text-warning shrink-0" />
          <p className="text-sm font-medium text-ink">
            {pendingCount} indent{pendingCount > 1 ? 's' : ''} awaiting action
          </p>
        </div>
      )}

      <div className="flex gap-1 bg-surface-muted rounded-lg p-1 mb-3 w-full sm:w-fit overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() =>
              patchParams({
                // Keep tab=all in the URL (do not delete — missing tab defaults to pending).
                // Clear queue so the full indent list is visible, not a status chip slice.
                tab: t.key,
                ...(t.key === 'all' ? { queue: undefined } : {}),
              })
            }
            className={cn(
              'px-4 py-2 text-sm font-semibold rounded-md whitespace-nowrap transition-colors',
              tab === t.key
                ? 'bg-white text-ink border border-surface-border'
                : 'text-ink-secondary hover:text-ink'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {!isLoading && !isError && (
        <IndentListFilters
          search={localSearch}
          onSearchChange={setSearch}
          queue={queue}
          onQueueChange={(next) => patchParams({ queue: next || undefined })}
          queueOptions={queueOptions}
          category={category}
          onCategoryChange={(next) => patchParams({ category: next || undefined })}
          categories={categories}
          days={days}
          onDaysChange={(next) => patchParams({ days: next || undefined })}
          resultCount={filtered.length}
          totalCount={requests?.length ?? 0}
        />
      )}

      {isLoading || isFetching ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-20 rounded-lg bg-surface-muted animate-pulse border border-surface-border"
            />
          ))}
        </div>
      ) : isError ? (
        <div className="panel p-8 text-center">
          <AlertCircle className="h-10 w-10 text-danger mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-ink">Could not load material indents</h2>
          <p className="text-sm text-ink-secondary mt-2 max-w-md mx-auto">
            {errorMessage ||
              'The server returned an error. Please retry or contact support if this persists.'}
          </p>
          <Button variant="secondary" className="mt-6" onClick={() => void refetch()}>
            <RefreshCw className="h-4 w-4" />
            Retry
          </Button>
        </div>
      ) : !requests?.length ? (
        <EmptyState
          title="No material indents"
          description={
            isSite
              ? 'Raise a material indent when your site needs supplies.'
              : 'No indents match this view for your role.'
          }
        />
      ) : !filtered.length ? (
        <EmptyState
          title="No matching indents"
          description="Try another search, clear filters, or pick a different status chip."
        />
      ) : (
        <MaterialIndentsTable
          requests={filtered}
          showProcurementTrace={role === UserRole.EXECUTIVE}
          renderAction={renderIndentAction}
          onRowClick={(id) => {
            const row = filtered.find((r) => r.id === id);
            if (role === UserRole.STORE_INCHARGE && row?.status === 'PENDING_STORE') {
              navigate(`/store/allocate/${id}`);
              return;
            }
            navigate(`/requests/${id}`);
          }}
        />
      )}
    </div>
  );
}
