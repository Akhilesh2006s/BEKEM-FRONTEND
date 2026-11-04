import { useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { forbiddenQueryOptions, isForbiddenError, useRedirectOnForbidden } from '@/lib/forbiddenRedirect';
import { ROLE_COLORS, UserRole, hideIndentPricingForRole, INDENT_REQUEST_TYPE_LABELS, formatProjectLabel } from '@afios/shared';
import type { MaterialRequestDto } from '@afios/shared';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Input';
import { SuccessScreen } from '@/components/SuccessScreen';
import { StockComparisonTable } from '@/components/StockComparisonTable';

export function AllocateFlowPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const accent = ROLE_COLORS[UserRole.STORE_INCHARGE].primary;
  const [remark, setRemark] = useState('');
  const [remarkError, setRemarkError] = useState('');
  const [phase, setPhase] = useState<'review' | 'done'>('review');

  const {
    data: request,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['material-request', id],
    queryFn: async () => {
      const res = await api.get<{ data: MaterialRequestDto }>(`/material-requests/${id}`);
      return res.data.data;
    },
    enabled: !!id,
    ...forbiddenQueryOptions,
  });

  useRedirectOnForbidden(error);

  const actionMutation = useMutation({
    mutationFn: async (decision: 'issue' | 'forward') => {
      const trimmed = remark.trim();
      if (!trimmed) {
        throw new Error('Remark is required before submitting');
      }
      await api.post(`/material-requests/${id}/allocate`, { decision, remark: trimmed });
    },
    onSuccess: (_, decision) => {
      toast.success(
        decision === 'issue' ? 'Allocation request sent to PM' : 'Forwarded to PM for stock requisition'
      );
      setPhase('done');
      queryClient.invalidateQueries({ queryKey: ['store-pending-requests'] });
    },
    onError: (err: Error & { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message || err.message || 'Action failed');
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async () => {
      const trimmed = remark.trim();
      if (!trimmed) throw new Error('Remark is required before rejecting');
      await api.post(`/material-requests/${id}/store-reject`, { remark: trimmed });
    },
    onSuccess: () => {
      toast.success('Indent rejected');
      setPhase('done');
      queryClient.invalidateQueries({ queryKey: ['store-pending-requests'] });
    },
    onError: (err: Error & { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message || err.message || 'Rejection failed');
    },
  });

  const submit = (decision: 'issue' | 'forward') => {
    if (!remark.trim()) {
      setRemarkError('Remark is required before submitting this action');
      return;
    }
    setRemarkError('');
    actionMutation.mutate(decision);
  };

  if (phase === 'done') {
    return (
      <SuccessScreen
        title="Done!"
        message="Indent updated successfully."
        accentColor={accent}
        primaryAction={{
          label: 'Back to my indents',
          onClick: () => navigate('/store/requests?tab=pending'),
        }}
      />
    );
  }

  if (isLoading) {
    return <div className="p-6 h-40 bg-surface-muted animate-pulse rounded-xl mx-4 mt-4" />;
  }
  if (isError && isForbiddenError(error)) return null;
  if (!request) return null;
  if (request.status !== 'PENDING_STORE' || request.allocationReviewStage || request.pmProceededAllocation) {
    return <Navigate to={`/requests/${request.id}`} replace />;
  }

  const items = request.items?.length
    ? request.items
    : request.materialId
      ? [
          {
            id: request.id,
            materialId: request.materialId,
            quantityRequested: request.quantityRequested || 0,
            quantityAllocated: request.quantityAllocated || 0,
            material: request.material,
            requestedQty: request.items?.[0]?.requestedQty,
            availableQty: request.items?.[0]?.availableQty,
            requiredQty: request.items?.[0]?.requiredQty,
          },
        ]
      : [];

  const hidePricing = hideIndentPricingForRole(UserRole.STORE_INCHARGE, request?.indentRequestType);
  const canIssue = request.canFullyIssue ?? !request.hasShortfall;

  return (
    <div className="px-4 pt-4 pb-6 max-w-3xl mx-auto">
      <header className="flex items-center gap-3 mb-3">
        <button
          onClick={() => navigate('/store/requests?tab=pending')}
          className="h-10 w-10 rounded-xl hover:bg-gray-100 flex items-center justify-center"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="font-semibold">{request.indentNumber}</h1>
          <p className="text-xs text-ink-secondary">
            {formatProjectLabel(request.project)}
            {request.site?.name ? ` · ${request.site.name}` : ''}
            {request.site?.chainageLabel ? ` · ${request.site.chainageLabel}` : ''}
            {` · ${items.length} item(s)`}
            {request.indentRequestType
              ? ` · ${INDENT_REQUEST_TYPE_LABELS[request.indentRequestType]}`
              : ''}{' '}
            — full indent only, no partial allocation
          </p>
        </div>
      </header>

        {!canIssue && (
          <div className="mb-4 rounded-xl border border-warning/30 bg-warning/5 px-3 py-2 text-sm text-ink-secondary">
            One or more lines are short on stock. Forward the entire indent to the Project Manager
            for a decision — partial issue is not allowed.
          </div>
        )}

        {canIssue && (
          <div className="mb-4 rounded-xl border border-success/30 bg-success-light/50 px-3 py-2 text-sm text-success-dark">
            Stock is available. Send an allocation request to PM before material can be issued.
          </div>
        )}

      <StockComparisonTable
        items={items}
        className="mb-3"
        showPricing={!hidePricing}
        totalEstimatedValue={hidePricing ? undefined : request.estimatedValue}
      />

      <div className="mb-4">
        <label className="text-sm font-medium text-ink-secondary block mb-2">
          Remark <span className="text-danger">*</span>
        </label>
        <Textarea
          value={remark}
          onChange={(e) => {
            setRemark(e.target.value);
            if (e.target.value.trim()) setRemarkError('');
          }}
          placeholder={
            canIssue
              ? 'Store verification note (stock available — allocation request to PM)…'
              : 'Reason for stock requisition forward to PM…'
          }
        />
        {remarkError && <p className="text-xs text-danger mt-1">{remarkError}</p>}
      </div>

      <div className="flex flex-col gap-2">
        <Button
          variant="accent"
          size="lg"
          accentColor={accent}
          disabled={actionMutation.isPending}
          onClick={() => submit(canIssue ? 'issue' : 'forward')}
        >
          {canIssue ? 'Allocation Request to PM' : 'Forward to PM, for Stock requisition'}
        </Button>
        <Button
          variant="ghost"
          size="lg"
          className="text-danger"
          disabled={rejectMutation.isPending}
          onClick={() => {
            if (!remark.trim()) {
              setRemarkError('Remark is required before rejecting this indent');
              return;
            }
            setRemarkError('');
            rejectMutation.mutate();
          }}
        >
          Reject indent
        </Button>
      </div>
    </div>
  );
}
