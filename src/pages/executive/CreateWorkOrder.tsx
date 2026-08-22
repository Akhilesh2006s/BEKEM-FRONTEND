import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import {
  ROLE_COLORS,
  UserRole,
  formatCurrency,
  formatProjectLabel,
  type PurchaseOrderDto,
  type WorkOrderDto,
} from '@afios/shared';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { SuccessScreen } from '@/components/SuccessScreen';
import { EmptyState } from '@/components/EmptyState';
import { ListQueryBoundary } from '@/components/ListQueryBoundary';
import { useListQuery, normalizeListData } from '@/hooks/useListQuery';
import { cn } from '@/lib/utils';

export function CreateWorkOrderPage() {
  const navigate = useNavigate();
  const accent = ROLE_COLORS[UserRole.EXECUTIVE].primary;
  const [selectedPo, setSelectedPo] = useState<PurchaseOrderDto | null>(null);
  const [scope, setScope] = useState('');
  const [totalQuantity, setTotalQuantity] = useState('');
  const [quantityUnit, setQuantityUnit] = useState('Units');
  const [createdWo, setCreatedWo] = useState<WorkOrderDto | null>(null);

  const { data: approvedPos, list } = useListQuery({
    queryKey: ['approved-pos-for-wo'],
    queryFn: async () => {
      const [poRes, woRes] = await Promise.all([
        api.get<{ data: PurchaseOrderDto[] }>('/purchase-orders', { params: { status: 'APPROVED' } }),
        api.get<{ data: WorkOrderDto[] }>('/work-orders'),
      ]);
      const pos = normalizeListData<PurchaseOrderDto>(poRes.data.data);
      const workOrders = normalizeListData<WorkOrderDto>(woRes.data.data);
      const usedPoIds = new Set(workOrders.map((w) => w.purchaseOrderId));
      return pos.filter((po) => !usedPoIds.has(po.id));
    },
  });

  const createWo = useMutation({
    mutationFn: async () => {
      const res = await api.post<{ data: WorkOrderDto }>('/work-orders', {
        purchaseOrderId: selectedPo!.id,
        scope,
        totalQuantity: parseFloat(totalQuantity),
        quantityUnit,
      });
      return res.data.data;
    },
    onSuccess: (wo) => {
      toast.success('Work order created');
      setCreatedWo(wo);
    },
    onError: () => toast.error('Failed to create work order'),
  });

  if (createdWo) {
    return (
      <SuccessScreen
        title="Work order created!"
        message={`${createdWo.woNumber} is pending Project Manager approval.`}
        accentColor={accent}
        primaryAction={{
          label: 'View work order',
          onClick: () => navigate(`/work-orders/${createdWo.id}`),
        }}
        secondaryAction={{ label: 'Back to home', onClick: () => navigate('/executive') }}
      />
    );
  }

  return (
    <div className="page-container max-w-lg mx-auto">
      <header className="flex items-center gap-3 mb-3">
        <button
          onClick={() => navigate('/executive')}
          className="h-10 w-10 flex items-center justify-center rounded-xl hover:bg-gray-100"
          aria-label="Go back"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="font-semibold text-lg">Generate work order</h1>
          <p className="text-sm text-ink-secondary">From an approved purchase order</p>
        </div>
      </header>

      {!selectedPo ? (
        <>
          <h2 className="text-sm font-semibold text-ink mb-3">Select approved PO</h2>
          <ListQueryBoundary
            isLoading={list.isLoading}
            isError={list.isError}
            onRetry={list.onRetry}
            retrying={list.retrying}
            isEmpty={!approvedPos?.length}
            skeletonRows={3}
            empty={
              <EmptyState
                title="No approved POs available"
                description="Complete PO approval first, or all approved POs already have work orders."
              />
            }
          >
            <div className="space-y-2">
              {(approvedPos ?? []).map((po) => (
                <Card
                  key={po.id}
                  className={cn('cursor-pointer hover:border-bekem-accent transition-colors py-3')}
                  onClick={() => {
                    setSelectedPo(po);
                    setScope(po.purchaseRequest?.project?.name
                      ? `Execution — ${formatProjectLabel(po.purchaseRequest.project)}`
                      : '');
                  }}
                >
                  <p className="font-semibold text-ink">{po.poNumber}</p>
                  <p className="text-sm text-ink-secondary">
                    {po.vendor?.name} · {formatCurrency(po.amount)}
                  </p>
                  {po.purchaseRequest?.project && (
                    <p className="text-xs text-ink-muted mt-1">
                      {formatProjectLabel(po.purchaseRequest.project)}
                    </p>
                  )}
                </Card>
              ))}
            </div>
          </ListQueryBoundary>
        </>
      ) : (
        <div className="space-y-3">
          <Card className="py-3">
            <p className="text-xs text-ink-muted">Selected PO</p>
            <p className="font-semibold">{selectedPo.poNumber}</p>
            <p className="text-sm text-ink-secondary">
              Contractor: {selectedPo.vendor?.name} · {formatCurrency(selectedPo.amount)}
            </p>
            <button
              type="button"
              className="text-sm text-bekem-accent mt-2 hover:underline"
              onClick={() => setSelectedPo(null)}
            >
              Change PO
            </button>
          </Card>

          <div>
            <label className="text-sm font-medium text-ink">Scope of work</label>
            <Input
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              placeholder="e.g. Install 2,500 rooftop solar systems"
              className="mt-1"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-ink">Total quantity</label>
              <Input
                type="number"
                min={1}
                value={totalQuantity}
                onChange={(e) => setTotalQuantity(e.target.value)}
                placeholder="2500"
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-ink">Unit</label>
              <Input
                value={quantityUnit}
                onChange={(e) => setQuantityUnit(e.target.value)}
                placeholder="Houses"
                className="mt-1"
              />
            </div>
          </div>

          <Button
            variant="accent"
            size="lg"
            accentColor={accent}
            className="w-full"
            disabled={!scope.trim() || !totalQuantity || createWo.isPending}
            onClick={() => createWo.mutate()}
          >
            Generate work order
          </Button>
        </div>
      )}
    </div>
  );
}
