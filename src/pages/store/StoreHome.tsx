import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Package, ChevronRight, AlertTriangle, Warehouse, Search, FileBarChart2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { getGreeting, getFirstName, formatProjectLabel } from '@afios/shared';
import type { MaterialRequestDto, SiteDto } from '@afios/shared';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/EmptyState';
import { ListQueryBoundary } from '@/components/ListQueryBoundary';
import { PageHeader } from '@/components/layout/PageHeader';
import { StatCard } from '@/components/ui/StatCard';
import { TodayPanel } from '@/components/layout/TodayPanel';
import { useTodayActions } from '@/hooks/useTodayActions';
import { useListQuery, normalizeListData } from '@/hooks/useListQuery';
import { AgeingBadge, daysSince } from '@/components/ui/AgeingBadge';
import { Input } from '@/components/ui/Input';
import { isInAllocationReview } from '@/components/MaterialIndentsTable';

type StockRow = {
  id: string;
  materialId: string;
  quantityOnHand: number;
  quantityReserved: number;
  availableQty: number;
  lowStockThreshold: number;
  isLowStock: boolean;
  material: { name: string; unit: string; code: string; description?: string; grade?: string };
};

export function StoreHomePage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user)!;
  const [stockSearch, setStockSearch] = useState('');
  const { data: today, isLoading: todayLoading } = useTodayActions();

  const { data: site } = useQuery({
    queryKey: ['my-site'],
    queryFn: async () => {
      const res = await api.get<{ data: SiteDto }>('/sites/my');
      return res.data.data;
    },
  });

  const { data: summary } = useQuery({
    queryKey: ['stock-summary'],
    queryFn: async () => {
      const res = await api.get<{
        data: { waiting: number; stockItems: number; lowStock: number; incoming: number };
      }>(`/stock/site/${site?.id}/summary`);
      return res.data.data;
    },
    enabled: !!site?.id,
  });

  const { data: pendingRequests, list: pendingList } = useListQuery({
    queryKey: ['store-pending-requests'],
    queryFn: async () => {
      const res = await api.get<{ data: MaterialRequestDto[] }>('/material-requests', {
        params: { tab: 'pending' },
      });
      return normalizeListData<MaterialRequestDto>(res.data.data);
    },
  });

  const { data: stock, list: stockList } = useListQuery<StockRow[]>({
    queryKey: ['stock', site?.id],
    queryFn: async () => {
      const res = await api.get<{ data: StockRow[] }>(`/stock/site/${site?.id}`);
      return normalizeListData<StockRow>(res.data.data);
    },
    enabled: !!site?.id,
  });

  const filteredStock = stock?.filter((s) => {
    if (!stockSearch.trim()) return true;
    const q = stockSearch.toLowerCase();
    return (
      s.material.name.toLowerCase().includes(q) ||
      s.material.code.toLowerCase().includes(q) ||
      (s.material.grade || '').toLowerCase().includes(q) ||
      (s.material.description || '').toLowerCase().includes(q)
    );
  });

  const waiting = summary?.waiting || pendingRequests?.length || 0;

  return (
    <div className="page-container">
      <PageHeader
        eyebrow={getGreeting()}
        title={getFirstName(user.name)}
        subtitle={`Store Incharge · ${
          formatProjectLabel(site?.project, site?.chainageLabel || site?.name || 'Loading site…')
        }${site?.chainageLabel && site?.project ? ` · ${site.chainageLabel}` : ''}`}
        action={
          waiting > 0 ? (
            <Button onClick={() => navigate('/store/requests')}>
              <Package className="h-4 w-4" />
              Review {waiting} request{waiting !== 1 ? 's' : ''}
            </Button>
          ) : undefined
        }
      />

      <TodayPanel actions={today ?? []} loading={todayLoading} />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 section-gap">
        <StatCard label="Waiting" value={summary?.waiting ?? '—'} hint="Needs allocation" tone="amber" />
        <StatCard
          label="Stock items"
          value={summary?.stockItems ?? '—'}
          tone="store"
          icon={<Warehouse className="h-5 w-5" />}
          onClick={() => navigate('/store/stock')}
        />
        <StatCard
          label="Low stock"
          value={summary?.lowStock ?? '—'}
          hint="Below threshold"
          tone="rose"
        />
        <StatCard
          label="Reports"
          value="MIS"
          hint="Registers, aging, GRN, pipeline"
          tone="blue"
          icon={<FileBarChart2 className="h-5 w-5" />}
          onClick={() => navigate('/store/reports')}
        />
      </div>

      <div className="mb-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-ink uppercase tracking-wider">Existing stock</h2>
        </div>
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-muted" />
          <Input
            value={stockSearch}
            onChange={(e) => setStockSearch(e.target.value)}
            placeholder="Search item code, description, grade…"
            className="pl-10"
          />
        </div>
        <ListQueryBoundary
          isLoading={!site?.id || stockList.isLoading}
          isError={stockList.isError}
          onRetry={stockList.onRetry}
          retrying={stockList.retrying}
          skeletonRows={6}
          isEmpty={!!site?.id && !(filteredStock?.length)}
          empty={
            <EmptyState
              title="No stock on hand"
              description="Stock levels will appear once inventory is recorded for this site."
            />
          }
        >
        <div className="table-shell">
          <table className="data-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Description</th>
                <th className="num">Available</th>
                <th className="num">Reserved</th>
              </tr>
            </thead>
            <tbody>
              {(filteredStock ?? []).slice(0, 8).map((s) => (
                <tr key={s.id}>
                  <td className="cell-code">{s.material.code}</td>
                  <td className="cell-text">{s.material.name}</td>
                  <td className="num">
                    {s.availableQty ?? s.quantityOnHand} {s.material.unit}
                  </td>
                  <td className="num text-ink-muted">{s.quantityReserved || 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </ListQueryBoundary>
      </div>

      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-ink">My indents</h2>
          <button
            onClick={() => navigate('/store/stock')}
            className="text-sm font-medium text-bekem-navy hover:underline"
          >
            View stock
          </button>
        </div>

        <ListQueryBoundary
          isLoading={pendingList.isLoading}
          isError={pendingList.isError}
          onRetry={pendingList.onRetry}
          retrying={pendingList.retrying}
          isEmpty={!pendingRequests?.length}
          skeletonRows={3}
          empty={
            <EmptyState
              title="You're all caught up"
              description="No requests waiting for store action right now."
            />
          }
        >
          <div className="space-y-2">
            {(pendingRequests ?? []).map((r) => (
              <div
                key={r.id}
                className="data-row"
                onClick={() =>
                  navigate(
                    r.status === 'PENDING_STORE' && !isInAllocationReview(r)
                      ? `/store/allocate/${r.id}`
                      : `/requests/${r.id}`
                  )
                }
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-ink">{r.indentNumber}</p>
                  {r.purpose ? (
                    <p className="text-sm text-ink-secondary mt-0.5 line-clamp-2">{r.purpose}</p>
                  ) : null}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <AgeingBadge days={daysSince(r.createdAt)} />
                  <ChevronRight className="h-4 w-4 text-ink-muted shrink-0" />
                </div>
              </div>
            ))}
          </div>
        </ListQueryBoundary>
      </div>

      {(summary?.lowStock ?? 0) > 0 && (
        <div className="mt-6 rounded-lg border border-warning/25 bg-warning-light p-4 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-warning shrink-0" />
          <p className="text-sm text-warning-dark font-medium">
            {summary?.lowStock} material{summary?.lowStock !== 1 ? 's' : ''} below threshold
          </p>
        </div>
      )}
    </div>
  );
}
