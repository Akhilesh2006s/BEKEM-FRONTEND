import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate } from '@afios/shared';
import { PageHeader } from '@/components/layout/PageHeader';
import { EmptyState } from '@/components/EmptyState';
import { ListQueryBoundary } from '@/components/ListQueryBoundary';
import { useListQuery, normalizeListData } from '@/hooks/useListQuery';
import { cn } from '@/lib/utils';

interface AgingRow {
  id: string;
  itemCode: string;
  itemDescription: string;
  unit: string;
  batchId: string;
  grnNumber: string;
  receivedAt: string | null;
  availableQuantity: number;
  agingDays: number;
}

interface ProductGroup {
  key: string;
  itemCode: string;
  itemDescription: string;
  unit: string;
  totalQty: number;
  batchCount: number;
  maxAgingDays: number;
  batches: AgingRow[];
}

function agingTone(days: number) {
  if (days >= 90) return 'text-rose-800 bg-rose-50 border-rose-200';
  if (days >= 60) return 'text-amber-800 bg-amber-50 border-amber-200';
  if (days >= 30) return 'text-orange-800 bg-orange-50 border-orange-200';
  return 'text-emerald-700 bg-emerald-50 border-emerald-200';
}

function agingLabel(days: number) {
  if (days >= 90) return '90+ days';
  if (days >= 60) return '60–89 days';
  if (days >= 30) return '30–59 days';
  return 'Under 30 days';
}

function groupByProduct(rows: AgingRow[]): ProductGroup[] {
  const map = new Map<string, ProductGroup>();

  for (const row of rows) {
    const key = `${row.itemCode || '—'}::${row.itemDescription || ''}`;
    let group = map.get(key);
    if (!group) {
      group = {
        key,
        itemCode: row.itemCode || '—',
        itemDescription: row.itemDescription || '',
        unit: row.unit || '',
        totalQty: 0,
        batchCount: 0,
        maxAgingDays: 0,
        batches: [],
      };
      map.set(key, group);
    }
    group.totalQty += row.availableQuantity || 0;
    group.batchCount += 1;
    group.maxAgingDays = Math.max(group.maxAgingDays, row.agingDays || 0);
    group.batches.push(row);
  }

  return [...map.values()]
    .map((g) => ({
      ...g,
      batches: [...g.batches].sort((a, b) => (b.agingDays || 0) - (a.agingDays || 0)),
    }))
    .sort((a, b) => b.maxAgingDays - a.maxAgingDays || a.itemCode.localeCompare(b.itemCode));
}

export function StockAgingPage() {
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const { data, list } = useListQuery({
    queryKey: ['stock-aging'],
    queryFn: async () => {
      const res = await api.get<{ data: AgingRow[] }>('/stock/aging');
      return normalizeListData<AgingRow>(res.data.data);
    },
  });

  const groups = useMemo(() => groupByProduct(data ?? []), [data]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter(
      (g) =>
        g.itemCode.toLowerCase().includes(q) ||
        g.itemDescription.toLowerCase().includes(q) ||
        g.batches.some((b) => b.grnNumber.toLowerCase().includes(q))
    );
  }, [groups, query]);

  const summary = useMemo(() => {
    const products = filtered.length;
    const batches = filtered.reduce((s, g) => s + g.batchCount, 0);
    const qty = filtered.reduce((s, g) => s + g.totalQty, 0);
    const hot = filtered.filter((g) => g.maxAgingDays >= 90).length;
    return { products, batches, qty, hot };
  }, [filtered]);

  function toggle(key: string) {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function expandAll(open: boolean) {
    const next: Record<string, boolean> = {};
    for (const g of filtered) next[g.key] = open;
    setExpanded(next);
  }

  return (
    <div className="page-container max-w-full">
      <PageHeader
        title="Stock aging report"
        subtitle="FIFO GRN batches plus Opening / non-FIFO remainder so totals match live stock"
      />

      <ListQueryBoundary
        isLoading={list.isLoading}
        isError={list.isError}
        onRetry={list.onRetry}
        retrying={list.retrying}
        isEmpty={!data?.length}
        empty={
          <EmptyState
            title="No aged stock batches"
            description="Batches appear after GRNs are received and stock remains on hand."
          />
        }
      >
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
            <div className="relative w-full sm:max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-muted" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search product, code, or GRN…"
                className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-surface-border bg-white text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-bekem-navy/20"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="tabular-nums text-ink-secondary">
                {summary.products} products · {summary.batches} batches
                {summary.hot > 0 ? ` · ${summary.hot} at 90+ days` : ''}
              </span>
              <button
                type="button"
                onClick={() => expandAll(true)}
                className="px-2.5 py-1 rounded-md border border-surface-border bg-white text-ink-secondary hover:text-ink"
              >
                Expand all
              </button>
              <button
                type="button"
                onClick={() => expandAll(false)}
                className="px-2.5 py-1 rounded-md border border-surface-border bg-white text-ink-secondary hover:text-ink"
              >
                Collapse all
              </button>
            </div>
          </div>

          {filtered.length === 0 ? (
            <EmptyState title="No matching products" description="Try a different search." />
          ) : (
            <div className="space-y-2">
              {filtered.map((group) => {
                const open = !!expanded[group.key];
                return (
                  <div key={group.key} className="panel overflow-hidden">
                    <button
                      type="button"
                      onClick={() => toggle(group.key)}
                      className="w-full text-left px-3 py-3 sm:px-4 flex items-start gap-3 hover:bg-surface-muted/40 transition-colors"
                    >
                      <span className="mt-0.5 text-ink-muted shrink-0">
                        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </span>

                      <div className="min-w-0 flex-1 grid grid-cols-1 sm:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,0.7fr))] gap-2 sm:gap-4 items-center">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-ink truncate">
                            {group.itemCode}
                          </p>
                          <p className="text-sm text-ink-secondary truncate">
                            {group.itemDescription || '—'}
                          </p>
                        </div>

                        <div className="sm:text-right">
                          <p className="text-[10px] uppercase tracking-wide text-ink-muted">On hand</p>
                          <p className="text-sm font-semibold tabular-nums text-ink">
                            {group.totalQty} {group.unit}
                          </p>
                        </div>

                        <div className="sm:text-right">
                          <p className="text-[10px] uppercase tracking-wide text-ink-muted">Batches</p>
                          <p className="text-sm font-semibold tabular-nums text-ink">{group.batchCount}</p>
                        </div>

                        <div className="sm:text-right">
                          <p className="text-[10px] uppercase tracking-wide text-ink-muted">Oldest</p>
                          <span
                            className={cn(
                              'inline-flex mt-0.5 text-[11px] font-semibold px-2 py-0.5 rounded-full border tabular-nums',
                              agingTone(group.maxAgingDays)
                            )}
                            title={agingLabel(group.maxAgingDays)}
                          >
                            {group.maxAgingDays}d
                          </span>
                        </div>
                      </div>
                    </button>

                    {open && (
                      <div className="border-t border-surface-border bg-surface-muted/20">
                        <div className="overflow-x-auto">
                          <table className="data-table min-w-[40rem]">
                            <thead>
                              <tr>
                                <th>Batch</th>
                                <th>GRN</th>
                                <th>Received</th>
                                <th className="num">Available</th>
                                <th className="num">Aging</th>
                              </tr>
                            </thead>
                            <tbody>
                              {group.batches.map((batch) => (
                                <tr key={batch.id}>
                                  <td className="cell-code whitespace-nowrap">
                                    {batch.batchId.slice(-6)}
                                  </td>
                                  <td className="cell-code whitespace-nowrap">{batch.grnNumber}</td>
                                  <td className="whitespace-nowrap">
                                    {batch.receivedAt ? formatDate(batch.receivedAt) : '—'}
                                  </td>
                                  <td className="num tabular-nums">
                                    {batch.availableQuantity} {batch.unit}
                                  </td>
                                  <td className="num">
                                    <span
                                      className={cn(
                                        'inline-flex text-[11px] font-semibold px-2 py-0.5 rounded-full border tabular-nums',
                                        agingTone(batch.agingDays)
                                      )}
                                    >
                                      {batch.agingDays}d
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </ListQueryBoundary>
    </div>
  );
}
