import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { api } from '@/lib/api';
import type { MaterialRequestDto } from '@afios/shared';
import { UserRole } from '@afios/shared';
import { EmptyState } from '@/components/EmptyState';
import { ListQueryBoundary } from '@/components/ListQueryBoundary';
import { useListQuery, normalizeListData } from '@/hooks/useListQuery';
import { WorkflowStatusTabs, type WorkflowStatusTab } from '@/components/WorkflowStatusTabs';
import { MaterialIndentsTable } from '@/components/MaterialIndentsTable';
import { IndentListFilters, IndentQueueQuickButtons } from '@/components/IndentListFilters';
import {
  countIndentQueueFilters,
  filterMaterialIndents,
  getIndentQueueFiltersForRole,
  isIndentQueueFilterId,
  uniqueIndentCategories,
  type IndentDaysFilter,
  type IndentQueueQuickFilter,
} from '@/lib/indentListFilters';

export function StorePendingRequestsPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as WorkflowStatusTab) || 'all';
  const queueOptions = useMemo(() => getIndentQueueFiltersForRole(UserRole.STORE_INCHARGE), []);

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

  const { data: pendingRequests, list } = useListQuery({
    queryKey: ['store-pending-requests', tab],
    queryFn: async () => {
      const res = await api.get<{ data: MaterialRequestDto[] }>('/material-requests', {
        params: { tab },
      });
      return normalizeListData<MaterialRequestDto>(res.data.data);
    },
  });

  /** Open indents across store + onward queues — chip badges must not use tab=pending only
   *  (for store that is PENDING_STORE alone, so PM/Exec chips would always show 0). */
  const { data: openForCounts } = useQuery({
    queryKey: ['store-pending-requests', 'open', 'chip-counts'],
    queryFn: async () => {
      const [pendingRes, approvedRes] = await Promise.all([
        api.get<{ data: MaterialRequestDto[] }>('/material-requests', {
          params: { tab: 'pending' },
        }),
        api.get<{ data: MaterialRequestDto[] }>('/material-requests', {
          params: { tab: 'approved' },
        }),
      ]);
      const pending = normalizeListData<MaterialRequestDto>(pendingRes.data.data);
      const approved = normalizeListData<MaterialRequestDto>(approvedRes.data.data);
      const byId = new Map<string, MaterialRequestDto>();
      for (const r of [...pending, ...approved]) byId.set(r.id, r);
      return [...byId.values()];
    },
  });

  const categories = useMemo(
    () => uniqueIndentCategories(pendingRequests ?? []),
    [pendingRequests]
  );
  const filtered = useMemo(
    () =>
      filterMaterialIndents(pendingRequests ?? [], {
        search,
        queue,
        category,
        days,
      }),
    [pendingRequests, search, queue, category, days]
  );
  const queueCounts = useMemo(
    () => countIndentQueueFilters(openForCounts ?? pendingRequests ?? [], queueOptions),
    [openForCounts, pendingRequests, queueOptions]
  );

  const setSearch = (value: string) => {
    setLocalSearch(value);
    patchParams({ q: value.trim() || undefined });
  };

  return (
    <div className="px-4 pt-4 pb-6">
      <header className="flex flex-col gap-2 mb-3">
        <div className="flex items-start gap-3">
          <button
            onClick={() => navigate('/store')}
            className="h-10 w-10 flex items-center justify-center rounded-xl hover:bg-gray-100 shrink-0"
            aria-label="Go back"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex flex-col sm:flex-row sm:items-center sm:flex-wrap gap-2">
              <h1 className="font-semibold text-gray-900 shrink-0">My indents</h1>
              <IndentQueueQuickButtons
                value={queue}
                options={queueOptions}
                counts={queueCounts}
                onChange={(next) => {
                  if (next === 'all') {
                    patchParams({ queue: undefined, tab: 'all' });
                    return;
                  }
                  // Queue chips span Pending + Approved for store — switch to All so list matches badge.
                  patchParams({
                    queue: next || undefined,
                    tab: next ? 'all' : tab,
                  });
                }}
              />
            </div>
            <p className="text-xs text-ink-secondary mt-0.5">
              Pending and completed material indents for your store
            </p>
          </div>
        </div>
      </header>

      <WorkflowStatusTabs
        value={tab}
        onChange={(t) =>
          patchParams({
            tab: t,
          })
        }
      />

      {!list.isLoading && !list.isError && (
        <IndentListFilters
          search={localSearch}
          onSearchChange={setSearch}
          queue={queue}
          onQueueChange={(next) =>
            patchParams({
              queue: next || undefined,
              tab: next ? 'all' : tab,
            })
          }
          queueOptions={queueOptions}
          category={category}
          onCategoryChange={(next) => patchParams({ category: next || undefined })}
          categories={categories}
          days={days}
          onDaysChange={(next) => patchParams({ days: next || undefined })}
          resultCount={filtered.length}
          totalCount={pendingRequests?.length ?? 0}
        />
      )}

      <ListQueryBoundary
        isLoading={list.isLoading}
        isError={list.isError}
        onRetry={list.onRetry}
        retrying={list.retrying}
        isEmpty={!pendingRequests?.length}
        skeletonRows={3}
        empty={
          <EmptyState
            title={tab === 'completed' ? 'No completed indents yet' : 'No indents yet'}
            description={
              tab === 'completed'
                ? 'Indents appear here after site confirms receipt of issued materials.'
                : 'New site indents will appear here for allocation.'
            }
          />
        }
      >
        {!filtered.length ? (
          <EmptyState
            title="No matching indents"
            description="Try another search, clear filters, or pick a different status chip."
          />
        ) : (
          <MaterialIndentsTable
            requests={filtered}
            onRowClick={(id) => {
              const row = filtered.find((r) => r.id === id);
              navigate(
                row?.status === 'PENDING_STORE' && !row.allocationReviewStage && !row.pmProceededAllocation ? `/store/allocate/${id}` : `/requests/${id}`
              );
            }}
          />
        )}
      </ListQueryBoundary>
    </div>
  );
}
