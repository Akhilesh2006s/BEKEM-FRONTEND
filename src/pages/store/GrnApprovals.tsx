import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { formatCurrency, type GrnHoldQueueItemDto } from '@afios/shared';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { ListQueryBoundary } from '@/components/ListQueryBoundary';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/EmptyState';
import { useAuthStore } from '@/stores/authStore';
import { UserRole } from '@afios/shared';

export function GrnApprovalsPage() {
  const user = useAuthStore((s) => s.user)!;
  const isChairman = user.role === UserRole.CHAIRMAN;
  const queryClient = useQueryClient();

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['grn-hold-queue'],
    queryFn: async () => {
      const res = await api.get<{ data: GrnHoldQueueItemDto[] }>('/goods-receipts/hold-queue');
      return res.data.data;
    },
  });

  const approve = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.post<{ data: { message: string } }>(`/goods-receipts/${id}/approve`, {});
      return res.data.data;
    },
    onSuccess: (result) => {
      toast.success(result.message);
      queryClient.invalidateQueries({ queryKey: ['grn-hold-queue'] });
    },
    onError: (e: Error & { response?: { data?: { message?: string } } }) => {
      toast.error(e.response?.data?.message || 'Approval failed');
    },
  });

  return (
    <div className="page-container max-w-4xl">
      <PageHeader
        title="GRN on hold"
        subtitle={
          isChairman
            ? 'Approve quantity or price variances escalated by Coordinator'
            : 'Review GRNs with quantity or invoice rate variance before stock allocation'
        }
      />

      <ListQueryBoundary
        isLoading={isLoading}
        isError={isError}
        onRetry={() => refetch()}
        retrying={isFetching && !isLoading}
        isEmpty={!data?.length}
        empty={
          <EmptyState
            title="No GRNs awaiting approval"
            description="Variance holds appear here when received quantity or invoice rate differs from the PO."
          />
        }
      >
        <div className="space-y-3">
          {(data ?? []).map((grn) => (
            <div key={grn.id} className="panel p-3 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-ink">{grn.grnNumber}</p>
                  <p className="text-sm text-ink-secondary">
                    PO {grn.poNumber} · {grn.vendorName}
                  </p>
                  {grn.projectName && (
                    <p className="text-xs text-ink-muted mt-0.5">{grn.projectName}</p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status="ON_HOLD" />
                  {grn.holdReasons?.map((reason: string) => (
                    <span
                      key={reason}
                      className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200"
                    >
                      {reason === 'QTY'
                        ? 'Qty variance'
                        : reason === 'EWAY'
                          ? 'E-Way Bill'
                          : reason === 'REVIEW'
                            ? 'New receipt'
                            : 'Price variance'}
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap gap-2.5 text-sm">
                {grn.invoiceNo && <span>Invoice: {grn.invoiceNo}</span>}
                {grn.invoiceValue != null && (
                  <span>Value: {formatCurrency(grn.invoiceValue)}</span>
                )}
                {grn.requiresChairmanApproval && !isChairman && (
                  <span className="text-amber-700 font-medium">Needs Chairman after your approval</span>
                )}
              </div>

              {grn.varianceDetails?.lines?.length ? (
                <div className="rounded-xl border border-surface-border overflow-x-auto">
                  <table className="data-table text-xs min-w-[520px]">
                    <thead>
                      <tr>
                        <th>Item</th>
                        <th className="text-right">Ordered</th>
                        <th className="text-right">Received</th>
                        <th className="text-right">PO rate</th>
                        <th className="text-right">Invoice rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {grn.varianceDetails.lines.map((line: Record<string, unknown>, idx: number) => (
                        <tr key={idx}>
                          <td>{String(line.description || '—')}</td>
                          <td className="text-right tabular-nums">{String(line.orderedQty ?? '—')}</td>
                          <td className="text-right tabular-nums">{String(line.receivedQty ?? '—')}</td>
                          <td className="text-right tabular-nums">
                            {line.orderedUnitPrice != null
                              ? formatCurrency(Number(line.orderedUnitPrice))
                              : '—'}
                          </td>
                          <td className="text-right tabular-nums">
                            {line.invoiceUnitPrice != null
                              ? formatCurrency(Number(line.invoiceUnitPrice))
                              : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}

              <Button
                variant="accent"
                disabled={approve.isPending}
                onClick={() => approve.mutate(grn.id)}
              >
                {isChairman ? 'Approve & allocate stock' : 'Approve variance'}
              </Button>
            </div>
          ))}
        </div>
      </ListQueryBoundary>
    </div>
  );
}
