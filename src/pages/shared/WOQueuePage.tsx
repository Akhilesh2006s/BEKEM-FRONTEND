import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, HardHat } from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency, type GrnHoldQueueItemDto, type WorkOrderDto } from '@afios/shared';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/layout/PageHeader';
import { ActionCard } from '@/components/ui/ActionCard';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/EmptyState';
import { ListQueryBoundary } from '@/components/ListQueryBoundary';
import { useListQuery, normalizeListData } from '@/hooks/useListQuery';
import { AgeingBadge, daysSince } from '@/components/ui/AgeingBadge';
import { StatusBadge } from '@/components/ui/StatusBadge';

interface WOQueuePageProps {
  title: string;
  subtitle: string;
  queue: 'pm' | 'executive' | 'coordinator' | 'chairman';
  detailPrefix: '/pm' | '/executive' | '/coordinator' | '/chairman' | '/work-orders';
  queryKey: string;
}

function grnReasonLabel(reason: string) {
  if (reason === 'QTY') return 'Qty variance';
  if (reason === 'EWAY') return 'E-Way Bill';
  if (reason === 'PRICE') return 'Price variance';
  if (reason === 'REVIEW') return 'New receipt';
  return reason;
}

export function WOQueuePage({ title, subtitle, queue, detailPrefix, queryKey }: WOQueuePageProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const includeGrns = queue === 'coordinator' || queue === 'chairman';

  const { data: items, list } = useListQuery({
    queryKey: [queryKey],
    queryFn: async () => {
      const res = await api.get<{ data: WorkOrderDto[] }>('/work-orders', {
        params: { queue },
      });
      return normalizeListData<WorkOrderDto>(res.data.data);
    },
  });

  const {
    data: grns,
    isLoading: grnsLoading,
    isError: grnsError,
    refetch: refetchGrns,
    isFetching: grnsFetching,
  } = useQuery({
    queryKey: ['grn-hold-queue', queue],
    queryFn: async () => {
      const res = await api.get<{ data: GrnHoldQueueItemDto[] }>('/goods-receipts/hold-queue');
      return res.data.data || [];
    },
    enabled: includeGrns,
  });

  const approveGrn = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.post<{ data: { message: string } }>(`/goods-receipts/${id}/approve`, {});
      return res.data.data;
    },
    onSuccess: (result) => {
      toast.success(result.message);
      queryClient.invalidateQueries({ queryKey: ['grn-hold-queue'] });
    },
    onError: (e: Error & { response?: { data?: { message?: string } } }) => {
      toast.error(e.response?.data?.message || 'GRN approval failed');
    },
  });

  const woPending = items?.length ?? 0;
  const grnPending = includeGrns ? grns?.length ?? 0 : 0;
  const pending = woPending + grnPending;
  const detailPath = detailPrefix === '/work-orders' ? '/work-orders' : `${detailPrefix}/wo`;
  const grnApprovalsPath =
    queue === 'chairman' ? '/chairman/grn-approvals' : '/coordinator/grn-approvals';
  const isEmpty = !woPending && !grnPending;
  const isLoading = list.isLoading || (includeGrns && grnsLoading);
  const isError = list.isError || (includeGrns && grnsError);

  return (
    <div className="page-container max-w-full">
      <PageHeader title={title} subtitle={subtitle} />

      <ActionCard
        title="Pending review"
        count={pending}
        subtitle={pending > 0 ? 'Awaiting your review' : 'Queue clear'}
        icon={HardHat}
        tone="info"
        className="mb-4"
      />

      <ListQueryBoundary
        isLoading={isLoading}
        isError={isError}
        onRetry={() => {
          list.onRetry();
          if (includeGrns) void refetchGrns();
        }}
        retrying={list.retrying || (includeGrns && grnsFetching && !grnsLoading)}
        isEmpty={isEmpty}
        empty={
          <EmptyState
            celebrate
            title="Nothing pending"
            description={
              includeGrns
                ? 'Work orders and material receipts (GRN) will appear here when they need your sign-off.'
                : 'Work orders will appear here when they need your sign-off.'
            }
          />
        }
      >
        <div className="table-shell">
          <table className="data-table min-w-[52rem]">
            <thead>
              <tr>
                <th>No</th>
                <th>Vendor</th>
                <th>Scope</th>
                <th className="num">Value</th>
                <th>Age</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {(grns ?? []).map((grn) => (
                <tr
                  key={`grn-${grn.id}`}
                  className="cursor-pointer"
                  onClick={() => navigate(grnApprovalsPath)}
                >
                  <td className="cell-code whitespace-nowrap">{grn.grnNumber}</td>
                  <td className="cell-text">{grn.vendorName || '—'}</td>
                  <td className="cell-text max-w-[14rem] truncate">
                    GRN · {grn.poNumber || 'PO'}
                    {grn.holdReasons?.length
                      ? ` · ${grn.holdReasons.map(grnReasonLabel).join(', ')}`
                      : ''}
                  </td>
                  <td className="num tabular-nums whitespace-nowrap">
                    {grn.invoiceValue != null ? formatCurrency(grn.invoiceValue) : '—'}
                  </td>
                  <td>
                    <AgeingBadge days={daysSince(grn.receivedAt)} />
                  </td>
                  <td>
                    <StatusBadge
                      status="ON_HOLD"
                      label={queue === 'chairman' ? 'Awaiting Chairman' : 'Awaiting Coordinator'}
                    />
                  </td>
                  <td
                    className="text-right whitespace-nowrap"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={approveGrn.isPending}
                      onClick={() => approveGrn.mutate(grn.id)}
                    >
                      {queue === 'chairman' ? 'Approve & allocate' : 'Approve GRN'}
                    </Button>
                  </td>
                </tr>
              ))}
              {(items ?? []).map((wo) => (
                <tr
                  key={`wo-${wo.id}`}
                  className="cursor-pointer"
                  onClick={() => navigate(`${detailPath}/${wo.id}`)}
                >
                  <td className="cell-code whitespace-nowrap">{wo.woNumber}</td>
                  <td className="cell-text">{wo.vendor?.name || '—'}</td>
                  <td className="cell-text max-w-[14rem] truncate">{wo.scope || '—'}</td>
                  <td className="num tabular-nums whitespace-nowrap">
                    {formatCurrency(wo.contractValue)}
                  </td>
                  <td>
                    <AgeingBadge days={daysSince(wo.createdAt)} />
                  </td>
                  <td>
                    <StatusBadge status={wo.status} />
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
    </div>
  );
}
