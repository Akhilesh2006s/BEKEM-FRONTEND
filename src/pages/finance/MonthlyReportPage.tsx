import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatCurrency, formatDate, type MonthlyTransactionReportDto } from '@afios/shared';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/layout/PageHeader';
import { ListQueryBoundary } from '@/components/ListQueryBoundary';
import { Card } from '@/components/ui/Card';

export function MonthlyReportPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['monthly-transaction-report', year, month],
    queryFn: async () => {
      const res = await api.get<{ data: MonthlyTransactionReportDto }>('/finance/monthly-report', {
        params: { year, month },
      });
      return res.data.data;
    },
  });

  return (
    <div className="page-container max-w-5xl">
      <PageHeader
        title="Monthly transaction report"
        subtitle="Grocery, mess, misc purchases & PO bill audit"
        onBack
      />

      <div className="flex flex-wrap gap-3 mb-4">
        <label className="text-xs font-medium text-ink-secondary">
          Month
          <select
            className="mt-1 block h-8 rounded-lg border border-surface-border px-2 text-sm"
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>
                {new Date(2000, m - 1, 1).toLocaleString('en-IN', { month: 'long' })}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-ink-secondary">
          Year
          <select
            className="mt-1 block h-8 rounded-lg border border-surface-border px-2 text-sm"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          >
            {[year - 1, year, year + 1].map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
      </div>

      <ListQueryBoundary
        isLoading={isLoading}
        isError={isError}
        onRetry={() => refetch()}
        retrying={isFetching && !isLoading}
        isEmpty={false}
        empty={<></>}
      >
        {data && (
          <div className="space-y-3">
            <p className="text-sm font-semibold text-ink">{data.periodLabel}</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Card className="p-3">
                <p className="text-[10px] uppercase text-ink-muted">Misc total</p>
                <p className="text-lg font-bold tabular-nums">{formatCurrency(data.summary.miscPurchaseTotal)}</p>
              </Card>
              <Card className="p-3">
                <p className="text-[10px] uppercase text-ink-muted">PO bills</p>
                <p className="text-lg font-bold tabular-nums">{formatCurrency(data.summary.poBillTotal)}</p>
              </Card>
              <Card className="p-3">
                <p className="text-[10px] uppercase text-ink-muted">Combined</p>
                <p className="text-lg font-bold tabular-nums">{formatCurrency(data.summary.combinedTotal)}</p>
              </Card>
              <Card className="p-3">
                <p className="text-[10px] uppercase text-ink-muted">Transactions</p>
                <p className="text-lg font-bold tabular-nums">
                  {data.summary.miscTransactionCount + data.summary.poBillCount}
                </p>
              </Card>
            </div>

            <div>
              <h2 className="section-label mb-2">Misc by category</h2>
              {!data.miscByCategory.length ? (
                <p className="text-sm text-ink-muted">No approved misc purchases this month.</p>
              ) : (
                <div className="table-shell">
                  <table className="data-table min-w-[28rem]">
                    <thead>
                      <tr>
                        <th>Category</th>
                        <th className="text-right">Count</th>
                        <th className="text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.miscByCategory.map((row) => (
                        <tr key={row.categoryKey}>
                          <td className="font-medium">{row.categoryKey.replace(/_/g, ' ')}</td>
                          <td className="text-right tabular-nums">{row.count}</td>
                          <td className="text-right tabular-nums">{formatCurrency(row.totalAmount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div>
              <h2 className="section-label mb-2">PO bills (audit trail)</h2>
              {!data.poBills.length ? (
                <p className="text-sm text-ink-muted">No PO-linked bills this month.</p>
              ) : (
                <div className="table-shell">
                  <table className="data-table min-w-[48rem]">
                    <thead>
                      <tr>
                        <th>Bill</th>
                        <th>Vendor</th>
                        <th>Project</th>
                        <th className="text-right">Value</th>
                        <th>Status</th>
                        <th>Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.poBills.map((b) => (
                        <tr key={b.id}>
                          <td className="text-xs">{b.billNumber}</td>
                          <td>{b.vendorName}</td>
                          <td>{b.projectCode}</td>
                          <td className="text-right tabular-nums">{formatCurrency(b.invoiceValue)}</td>
                          <td>{b.paymentStatus}</td>
                          <td className="text-xs">{b.createdAt ? formatDate(b.createdAt) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </ListQueryBoundary>
    </div>
  );
}
