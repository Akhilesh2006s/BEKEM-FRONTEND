import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { Check, Fingerprint, Send, X, ArrowLeftRight } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { approvalCapDayKey } from '@/lib/approvalCapDay';
import { requireBiometricConfirm } from '@/lib/biometricGate';
import type { DailyCapDto, MaterialRequestDto, PmApprovalStateDto } from '@afios/shared';
import { formatProjectLabel, indentExceedsPmApprovalLevel, PM_ABOVE_APPROVAL_LEVEL_MESSAGE } from '@afios/shared';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/layout/PageHeader';
import { ListQueryBoundary } from '@/components/ListQueryBoundary';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { isInAllocationReview, isCurrentAllocationOwner } from '@/components/MaterialIndentsTable';
import { otherProjectSitesWithStock } from '@/components/CrossProjectStockPanel';

export function PmMobileApprovalPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: request, isLoading, isError, refetch } = useQuery({
    queryKey: ['material-request', id],
    queryFn: async () => {
      const res = await api.get<{ data: MaterialRequestDto }>(`/material-requests/${id}`);
      return res.data.data;
    },
    enabled: Boolean(id),
  });

  const { data: pmDailyCap } = useQuery({
    queryKey: ['pm-daily-cap', approvalCapDayKey()],
    queryFn: async () => {
      const res = await api.get<{ data: DailyCapDto }>('/material-requests/pm/daily-cap');
      return res.data.data;
    },
  });

  const stockAvailable = Boolean(request?.canFullyIssue);
  const isBelowCap = request?.indentRequestType === 'BELOW_5000';
  const otherStockAvailable = Boolean(
    request &&
      otherProjectSitesWithStock(request.crossProjectStock || [], request.projectId).length
  );
  const showBranchTransfer = Boolean(
    request &&
      ['FORWARDED_TO_PM', 'BRANCH_TRANSFER_REQUESTED'].includes(request.status) &&
      !request.escalatedToHo &&
      otherStockAvailable
  );
  const exceedsPmApprovalLevel = indentExceedsPmApprovalLevel(
    request?.estimatedValue,
    request?.indentRequestType
  );
  /** Daily cap is a separate check — only for indents still within the PM per-indent limit. */
  const wouldExceedPmCap = Boolean(
    !isBelowCap &&
      !exceedsPmApprovalLevel &&
      pmDailyCap &&
      pmDailyCap.dailyApprovedTotal + (request?.estimatedValue || 0) > pmDailyCap.dailyCap
  );
  const showForwardToHo =
    request?.status === 'FORWARDED_TO_PM' && (!stockAvailable || exceedsPmApprovalLevel);
  const showApprove =
    request?.status === 'FORWARDED_TO_PM' && stockAvailable && !exceedsPmApprovalLevel;
  const showProceedAllocation = Boolean(
    request && isInAllocationReview(request) && isCurrentAllocationOwner(request, 'PROJECT_MANAGER')
  );
  const closesAtPm = stockAvailable && !wouldExceedPmCap;

  const approve = useMutation({
    mutationFn: async () => {
      const ok = await requireBiometricConfirm(
        closesAtPm ? 'Close indent at PM' : 'Approve indent'
      );
      if (!ok) throw new Error('Biometric confirmation cancelled');
      const res = await api.post<{
        data: MaterialRequestDto;
        message?: string;
        pmApprovalState?: PmApprovalStateDto;
      }>(`/material-requests/${id}/pm-local-close`, {
        remark: closesAtPm
          ? 'Closed at PM — stock available'
          : 'Approved',
      });
      return res.data;
    },
    onSuccess: (payload) => {
      const state = payload.pmApprovalState;
      const firstStock = state?.stockByLine?.[0];
      const stockBit =
        firstStock != null ? ` · stock now ${firstStock.availableQty}` : '';
      const capBit =
        state != null ? ` · ₹${state.remaining.toLocaleString('en-IN')} left today` : '';
      if (state?.decision === 'FORWARDED_STOCK' || state?.decision === 'FORWARDED_DAILY_CAP') {
        toast.message(payload.message || 'Forwarded to Head Office');
      } else {
        toast.success(payload.message || `Closed at PM — stock reserved${stockBit}${capBit}`);
      }
      queryClient.invalidateQueries({ queryKey: ['pm-approvals'] });
      queryClient.invalidateQueries({ queryKey: ['pm-daily-cap'] });
      queryClient.invalidateQueries({ queryKey: ['material-requests'] });
      navigate('/pm/material-indents?tab=pending&queue=approved-store');
    },
    onError: (e: Error & { response?: { data?: { message?: string } } }) => {
      if (e.message !== 'Biometric confirmation cancelled') {
        toast.error(e.response?.data?.message || e.message || 'Approval failed');
      }
    },
  });

  const forwardHo = useMutation({
    mutationFn: async () => {
      const ok = await requireBiometricConfirm('Forward to Head Office');
      if (!ok) throw new Error('Biometric confirmation cancelled');
      const res = await api.post<{ message?: string }>(`/material-requests/${id}/forward-to-ho`, {
        remark: exceedsPmApprovalLevel
          ? 'Forwarded to HO — indent exceeds PM approval level'
          : 'Forwarded to HO for stock requisition via mobile',
      });
      return res.data.message;
    },
    onSuccess: (message) => {
      toast.success(message || 'Forwarded to Head Office for further approval');
      queryClient.invalidateQueries({ queryKey: ['pm-approvals'] });
      navigate('/pm/material-indents?tab=pending&queue=approved-store');
    },
    onError: (e: Error & { response?: { data?: { message?: string } } }) => {
      if (e.message !== 'Biometric confirmation cancelled') {
        toast.error(e.response?.data?.message || e.message || 'Forward failed');
      }
    },
  });

  const proceedAllocation = useMutation({
    mutationFn: async () => {
      const ok = await requireBiometricConfirm('Proceed with Allocation');
      if (!ok) throw new Error('Biometric confirmation cancelled');
      await api.post(`/material-requests/${id}/proceed-allocation`, {
        remark: 'Proceed with allocation after Executive approval',
      });
    },
    onSuccess: () => {
      toast.success('Proceeded with allocation');
      queryClient.invalidateQueries({ queryKey: ['pm-approvals'] });
      queryClient.invalidateQueries({ queryKey: ['material-requests'] });
      navigate('/pm/material-indents?tab=pending&queue=executive');
    },
    onError: (e: Error & { response?: { data?: { message?: string } } }) => {
      if (e.message !== 'Biometric confirmation cancelled') {
        toast.error(e.response?.data?.message || e.message || 'Could not proceed with allocation');
      }
    },
  });

  const reject = useMutation({
    mutationFn: async () => {
      const ok = await requireBiometricConfirm('Reject indent');
      if (!ok) throw new Error('Biometric confirmation cancelled');
      await api.post(`/material-requests/${id}/reject`, {
        reason: 'Rejected via mobile',
      });
    },
    onSuccess: () => {
      toast.success('Indent rejected');
      queryClient.invalidateQueries({ queryKey: ['pm-approvals'] });
      navigate('/pm/material-indents?tab=pending&queue=approved-store');
    },
    onError: (e: Error & { response?: { data?: { message?: string } } }) => {
      if (e.message !== 'Biometric confirmation cancelled') {
        toast.error(e.response?.data?.message || e.message || 'Rejection failed');
      }
    },
  });

  const items = request?.items?.length
    ? request.items
    : request?.materialId
      ? [
          {
            material: request.material,
            quantityRequested: request.quantityRequested || 0,
          },
        ]
      : [];

  const busy = approve.isPending || forwardHo.isPending || reject.isPending || proceedAllocation.isPending;

  return (
    <div className="min-h-[100dvh] bg-surface-muted px-4 py-6 max-w-lg mx-auto">
      <PageHeader title="Approve indent" subtitle="Review and confirm with Face ID / fingerprint" />

      <ListQueryBoundary
        isLoading={isLoading}
        isError={isError}
        onRetry={() => refetch()}
        isEmpty={!request}
        empty={<p className="text-sm text-ink-muted">Request not found.</p>}
      >
        {request && (
          <div className="space-y-3">
            <div className="panel p-3 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-bold text-ink">{request.indentNumber}</p>
                  <p className="text-sm text-ink-secondary">
                    {formatProjectLabel(request.project, 'Project')}
                  </p>
                </div>
                <StatusBadge status={request.status} />
              </div>

              <dl className="grid grid-cols-1 gap-2 text-sm">
                <div>
                  <dt className="text-ink-muted text-xs uppercase tracking-wide">Material</dt>
                  <dd className="font-medium">
                    {items
                      .map(
                        (item) =>
                          `${item.material?.name || 'Material'} · ${item.quantityRequested} ${item.material?.unit || ''}`
                      )
                      .join('; ')}
                  </dd>
                </div>
                <div>
                  <dt className="text-ink-muted text-xs uppercase tracking-wide">Requested by</dt>
                  <dd className="font-medium">{request.requester?.name || '—'}</dd>
                </div>
                {exceedsPmApprovalLevel ? (
                  <>
                    <div className="text-amber-800 text-xs font-medium bg-amber-50 rounded-lg px-3 py-2">
                      {PM_ABOVE_APPROVAL_LEVEL_MESSAGE}
                    </div>
                    <div
                      className={`text-xs font-medium rounded-lg px-3 py-2 ${
                        stockAvailable
                          ? 'text-emerald-700 bg-emerald-50'
                          : 'text-amber-800 bg-amber-50'
                      }`}
                    >
                      {stockAvailable ? 'Stock is available at site.' : 'Stock is short at site.'}
                    </div>
                  </>
                ) : stockAvailable && wouldExceedPmCap ? (
                  <div className="text-amber-800 text-xs font-medium bg-amber-50 rounded-lg px-3 py-2">
                    Daily approval cap is reached — this indent must go to Head Office
                  </div>
                ) : stockAvailable ? (
                  <div className="text-emerald-700 text-xs font-medium bg-emerald-50 rounded-lg px-3 py-2">
                    {showBranchTransfer
                      ? 'Stock available at this site — Approve to close, or request a branch transfer from other projects.'
                      : 'Stock available — Approve to close at PM and reserve for issue'}
                  </div>
                ) : showBranchTransfer ? (
                  <div className="text-amber-800 text-xs font-medium bg-amber-50 rounded-lg px-3 py-2">
                    This site is short, but other assigned projects have stock. Request a branch
                    transfer, or forward remaining to Head Office.
                  </div>
                ) : showForwardToHo ? (
                  <div className="text-amber-800 text-xs font-medium bg-amber-50 rounded-lg px-3 py-2">
                    Stock short — forward to HO for stock requisition
                  </div>
                ) : null}
              </dl>
            </div>

            <div className="grid grid-cols-1 gap-3">
              {showApprove && (
                <Button
                  variant="accent"
                  size="lg"
                  className="h-14"
                  disabled={busy}
                  onClick={() => approve.mutate()}
                >
                  <Check className="h-5 w-5 mr-2" />
                  {closesAtPm ? 'Approve & close at PM' : 'Approve'}
                </Button>
              )}
              {showBranchTransfer && (
                <Button
                  variant={showApprove ? 'secondary' : 'accent'}
                  size="lg"
                  className="h-14"
                  disabled={busy}
                  onClick={() => navigate(`/requests/${id}`)}
                >
                  <ArrowLeftRight className="h-5 w-5 mr-2" />
                  Request branch transfer
                </Button>
              )}
              {showForwardToHo && (
                <Button
                  variant={showBranchTransfer || showApprove ? 'secondary' : 'accent'}
                  size="lg"
                  className="h-14"
                  disabled={busy}
                  onClick={() => forwardHo.mutate()}
                >
                  <Send className="h-5 w-5 mr-2" />
                  {exceedsPmApprovalLevel
                    ? 'Forward to HO for further approval'
                    : 'Forward to HO for Stock Procurement'}
                </Button>
              )}
              {showProceedAllocation && (
                <Button
                  variant="accent"
                  size="lg"
                  className="h-14"
                  disabled={busy}
                  onClick={() => proceedAllocation.mutate()}
                >
                  <Check className="h-5 w-5 mr-2" />
                  Proceed with Allocation
                </Button>
              )}
              <Button
                variant="secondary"
                size="lg"
                className="h-14 text-danger border-danger/30"
                disabled={busy || request.status !== 'FORWARDED_TO_PM'}
                onClick={() => reject.mutate()}
              >
                <X className="h-5 w-5 mr-2" />
                Reject
              </Button>
            </div>

            <p className="text-xs text-center text-ink-muted flex items-center justify-center gap-1.5">
              <Fingerprint className="h-4 w-4" />
              Face ID or fingerprint required on supported devices
            </p>
          </div>
        )}
      </ListQueryBoundary>
    </div>
  );
}
