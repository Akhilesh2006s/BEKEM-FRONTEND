import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Download } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import {
  ROLE_COLORS,
  UserRole,
  formatCurrency,
  type WorkOrderDto,
  type DelegationStatusDto,
  formatProjectLabel,
} from '@afios/shared';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { StatusTimeline } from '@/components/StatusTimeline';
import { Input, Textarea } from '@/components/ui/Input';
import { SuccessScreen } from '@/components/SuccessScreen';
import { DetailField, DetailFieldGrid } from '@/components/ui/DetailFields';
import { forbiddenQueryOptions, isForbiddenError, useRedirectOnForbidden } from '@/lib/forbiddenRedirect';
import { getRoleHomePath } from '@/lib/rolePaths';
import { downloadExport } from '@/lib/downloadExport';
import { useApprovalShortcuts } from '@/hooks/useApprovalShortcuts';

export function WorkOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user)!;
  const role = user.role as UserRole;
  const [note, setNote] = useState('');
  const [done, setDone] = useState(false);
  const [doneMessage, setDoneMessage] = useState('');

  const [progressQty, setProgressQty] = useState('');
  const [exporting, setExporting] = useState(false);

  const accent =
    role === UserRole.COORDINATOR
      ? ROLE_COLORS[UserRole.COORDINATOR].primary
      : role === UserRole.CHAIRMAN
        ? ROLE_COLORS[UserRole.CHAIRMAN].primary
        : role === UserRole.PROJECT_MANAGER
          ? ROLE_COLORS[UserRole.PROJECT_MANAGER].primary
          : ROLE_COLORS[UserRole.EXECUTIVE].primary;

  const { data: delegationStatus } = useQuery({
    queryKey: ['delegation-status'],
    queryFn: async () => {
      const res = await api.get<{ data: DelegationStatusDto }>('/delegations/status');
      return res.data.data;
    },
  });

  const { data: wo, isLoading, isError, error } = useQuery({
    queryKey: ['work-order', id],
    queryFn: async () => {
      const res = await api.get<{ data: WorkOrderDto }>(`/work-orders/${id}`);
      return res.data.data;
    },
    enabled: !!id,
    ...forbiddenQueryOptions,
  });

  useRedirectOnForbidden(error);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['work-order', id] });
    queryClient.invalidateQueries({ queryKey: ['wo-queue'] });
    queryClient.invalidateQueries({ queryKey: ['wo-queue-pm'] });
    queryClient.invalidateQueries({ queryKey: ['wo-queue-executive'] });
    queryClient.invalidateQueries({ queryKey: ['wo-queue-coordinator'] });
    queryClient.invalidateQueries({ queryKey: ['wo-queue-chairman'] });
  };

  const pmApprove = useMutation({
    mutationFn: () => api.post(`/work-orders/${id}/pm-approve`, { note }),
    onSuccess: () => {
      setDoneMessage('Work order approved — sent to Executive for review');
      setDone(true);
    },
    onError: () => toast.error('PM approval failed'),
    onSettled: invalidate,
  });

  const executiveReview = useMutation({
    mutationFn: (action: 'APPROVE' | 'RETURN') =>
      api.post(`/work-orders/${id}/executive-review`, { action, note }),
    onSuccess: (_, action) => {
      setDoneMessage(
        action === 'APPROVE' ? 'Sent to Coordinator for verification' : 'Returned to Project Manager'
      );
      setDone(true);
    },
    onError: () => toast.error('Executive review failed'),
    onSettled: invalidate,
  });

  const verify = useMutation({
    mutationFn: (action: 'APPROVE' | 'RETURN') =>
      api.post(`/work-orders/${id}/verify`, { action, note }),
    onSuccess: (_, action) => {
      setDoneMessage(action === 'APPROVE' ? 'Verified and sent to Chairman' : 'Returned to Executive');
      setDone(true);
    },
    onError: () => toast.error('Verification failed'),
    onSettled: invalidate,
  });

  const approve = useMutation({
    mutationFn: () => api.post(`/work-orders/${id}/approve`, { note }),
    onSuccess: () => {
      setDoneMessage('Work order approved — awaiting contractor acceptance');
      setDone(true);
    },
    onError: () => toast.error('Approval failed'),
    onSettled: invalidate,
  });

  const reject = useMutation({
    mutationFn: () => api.post(`/work-orders/${id}/reject`, { note }),
    onSuccess: () => {
      setDoneMessage('Work order rejected');
      setDone(true);
    },
    onError: () => toast.error('Rejection failed'),
    onSettled: invalidate,
  });

  const accept = useMutation({
    mutationFn: () => api.post(`/work-orders/${id}/accept`, { note }),
    onSuccess: () => {
      setDoneMessage('Contractor acceptance recorded — work can now start');
      setDone(true);
    },
    onError: () => toast.error('Failed to record acceptance'),
    onSettled: invalidate,
  });

  const updateProgress = useMutation({
    mutationFn: (payload: { completedQuantity?: number; milestones?: Array<{ id: string; status: string }> }) =>
      api.post(`/work-orders/${id}/progress`, payload),
    onSuccess: () => toast.success('Progress updated'),
    onError: () => toast.error('Failed to update progress'),
    onSettled: invalidate,
  });

  const closeWo = useMutation({
    mutationFn: () => api.post(`/work-orders/${id}/close`, { note }),
    onSuccess: () => {
      setDoneMessage('Work order closed');
      setDone(true);
    },
    onError: () => toast.error('Cannot close work order yet'),
    onSettled: invalidate,
  });

  useApprovalShortcuts({
    enabled: !!wo && !done && !isLoading,
    onApprove: () => {
      if (!wo) return;
      if (role === UserRole.PROJECT_MANAGER && wo.status === 'PM_PENDING') pmApprove.mutate();
      else if (role === UserRole.EXECUTIVE && wo.status === 'EXECUTIVE_PENDING')
        executiveReview.mutate('APPROVE');
      else if (role === UserRole.COORDINATOR && wo.status === 'COORDINATOR_PENDING')
        verify.mutate('APPROVE');
      else if (
        wo.status === 'CHAIRMAN_PENDING' &&
        (role === UserRole.CHAIRMAN || delegationStatus?.canActAsChairman)
      )
        approve.mutate();
    },
    onReject: () => {
      if (!wo) return;
      if (role === UserRole.EXECUTIVE && wo.status === 'EXECUTIVE_PENDING')
        executiveReview.mutate('RETURN');
      else if (role === UserRole.COORDINATOR && wo.status === 'COORDINATOR_PENDING')
        verify.mutate('RETURN');
      else if (
        wo.status === 'CHAIRMAN_PENDING' &&
        (role === UserRole.CHAIRMAN || delegationStatus?.canActAsChairman)
      )
        reject.mutate();
    },
  });

  if (done) {
    return (
      <SuccessScreen
        title="Done!"
        message={doneMessage}
        accentColor={accent}
        primaryAction={{ label: 'Back to home', onClick: () => navigate(getRoleHomePath(role)) }}
      />
    );
  }

  if (isLoading) {
    return (
      <div className="px-4 pt-6">
        <div className="h-40 bg-gray-100 rounded-card animate-pulse" />
      </div>
    );
  }

  if (isError && isForbiddenError(error)) return null;
  if (!wo) return null;

  const isPmApprove = role === UserRole.PROJECT_MANAGER && wo.status === 'PM_PENDING';
  const isExecutiveReview = role === UserRole.EXECUTIVE && wo.status === 'EXECUTIVE_PENDING';
  const isCoordinatorVerify =
    role === UserRole.COORDINATOR && wo.status === 'COORDINATOR_PENDING';
  const canFinalApprove =
    wo.status === 'CHAIRMAN_PENDING' &&
    (role === UserRole.CHAIRMAN || delegationStatus?.canActAsChairman);
  const canAccept = role === UserRole.EXECUTIVE && wo.status === 'PENDING_ACCEPTANCE';
  const canTrack =
    role === UserRole.PROJECT_MANAGER && ['ACCEPTED', 'IN_PROGRESS'].includes(wo.status);
  const canClose =
    (role === UserRole.PROJECT_MANAGER || role === UserRole.EXECUTIVE) &&
    wo.status === 'IN_PROGRESS' &&
    wo.progressPercent >= 100;

  const remaining = wo.totalQuantity - wo.completedQuantity;

  const exportPdf = async () => {
    setExporting(true);
    try {
      await downloadExport(`/exports/work-orders/${wo.id}.pdf`, `${wo.woNumber}.pdf`);
      toast.success('Work order exported');
    } catch {
      toast.error('Export failed');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="px-4 pt-4 pb-6 max-w-lg mx-auto">
      <header className="flex items-center gap-3 mb-3">
        <button
          onClick={() => navigate(-1)}
          className="h-10 w-10 flex items-center justify-center rounded-xl hover:bg-gray-100"
          aria-label="Go back"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="font-semibold">{wo.woNumber}</h1>
          <StatusBadge status={wo.status} className="mt-1" />
        </div>
        <Button variant="ghost" size="sm" onClick={exportPdf} disabled={exporting}>
          <Download className="h-4 w-4" />
          PDF
        </Button>
      </header>

      <Card className="mb-3">
        <DetailFieldGrid>
          <DetailField label="Scope" labelClassName="text-gray-500">
            {wo.scope}
          </DetailField>
          <DetailField label="Contractor" labelClassName="text-gray-500">
            {wo.vendor?.name}
          </DetailField>
          <DetailField label="Contract value" labelClassName="text-gray-500" valueClassName="text-lg">
            {formatCurrency(wo.contractValue)}
          </DetailField>
          {wo.purchaseOrder && (
            <DetailField label="Linked PO" labelClassName="text-gray-500">
              {wo.purchaseOrder.poNumber}
            </DetailField>
          )}
          {wo.project && (
            <DetailField label="Project" labelClassName="text-gray-500">
              {formatProjectLabel(wo.project)}
            </DetailField>
          )}
        </DetailFieldGrid>
      </Card>

      {['ACCEPTED', 'IN_PROGRESS', 'CLOSED'].includes(wo.status) && (
        <Card className="mb-3">
          <div className="flex justify-between items-end mb-2">
            <div>
              <p className="text-xs text-gray-500">Progress</p>
              <p className="font-semibold text-lg">
                {wo.completedQuantity.toLocaleString()} / {wo.totalQuantity.toLocaleString()}{' '}
                {wo.quantityUnit}
              </p>
            </div>
            <span className="text-2xl font-bold text-bekem-accent">{wo.progressPercent}%</span>
          </div>
          <div className="h-2 rounded-full bg-surface-muted overflow-hidden">
            <div
              className="h-full bg-bekem-accent transition-all"
              style={{ width: `${wo.progressPercent}%` }}
            />
          </div>
          {remaining > 0 && (
            <p className="text-xs text-ink-muted mt-2">
              {remaining.toLocaleString()} {wo.quantityUnit} remaining
            </p>
          )}
        </Card>
      )}

      {(wo.milestones?.length ?? 0) > 0 && (
        <div className="mb-3">
          <h2 className="font-semibold text-sm mb-2">Milestones</h2>
          <div className="space-y-2">
            {(wo.milestones ?? []).map((ms) => (
              <div
                key={ms.id}
                className="flex items-center justify-between rounded-lg border border-surface-border px-3 py-2"
              >
                <span className="text-sm font-medium">{ms.name}</span>
                {canTrack ? (
                  <select
                    value={ms.status}
                    className="text-xs border rounded px-2 py-1"
                    onChange={(e) =>
                      updateProgress.mutate({
                        milestones: [{ id: ms.id, status: e.target.value }],
                      })
                    }
                  >
                    <option value="PENDING">Pending</option>
                    <option value="RUNNING">Running</option>
                    <option value="COMPLETED">Completed</option>
                  </select>
                ) : (
                  <StatusBadge status={ms.status} />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {(wo.materialIssues?.length ?? 0) > 0 && (
        <div className="mb-3">
          <h2 className="font-semibold text-sm mb-2">Materials issued</h2>
          <div className="space-y-2">
            {(wo.materialIssues ?? []).map((issue) => (
              <Card key={issue.id} className="py-2 flex justify-between text-sm">
                <span>{issue.materialName}</span>
                <span className="font-medium">
                  {issue.quantity} {issue.materialUnit}
                </span>
              </Card>
            ))}
          </div>
        </div>
      )}

      {(wo.certifications?.length ?? 0) > 0 && (
        <div className="mb-3">
          <h2 className="font-semibold text-sm mb-2">Certifications</h2>
          <div className="space-y-2">
            {(wo.certifications ?? []).map((cert) => (
              <Card key={cert.id} className="py-3 space-y-2">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-medium text-sm">
                      {cert.quantity} {wo.quantityUnit}
                    </p>
                    <p className="text-xs text-ink-secondary">{cert.note}</p>
                    {cert.evidenceNote && (
                      <p className="text-xs text-ink-muted mt-1">Evidence: {cert.evidenceNote}</p>
                    )}
                  </div>
                  <StatusBadge status={cert.status} />
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      <h2 className="font-semibold text-sm mb-3">Timeline</h2>
      <StatusTimeline entityType="WorkOrder" entityId={wo.id} />

      {canTrack && (
        <div className="mt-6 space-y-3 border-t border-surface-border pt-6">
          <h2 className="font-semibold text-sm">Update progress</h2>
          <Input
            type="number"
            placeholder={`Completed quantity (${wo.quantityUnit})`}
            value={progressQty}
            onChange={(e) => setProgressQty(e.target.value)}
          />
          <Button
            variant="secondary"
            disabled={!progressQty || updateProgress.isPending}
            onClick={() =>
              updateProgress.mutate({ completedQuantity: parseFloat(progressQty) })
            }
          >
            Save progress
          </Button>
        </div>
      )}

      {(isPmApprove || isExecutiveReview || isCoordinatorVerify || canFinalApprove || canAccept) && (
        <div className="mt-6 space-y-3 border-t border-surface-border pt-6">
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note or reason…"
          />
          {isPmApprove && (
            <Button
              variant="accent"
              size="lg"
              accentColor={accent}
              disabled={pmApprove.isPending}
              onClick={() => pmApprove.mutate()}
            >
              Approve & send to Executive
            </Button>
          )}
          {isExecutiveReview && (
            <div className="flex flex-col gap-2">
              <Button
                variant="accent"
                size="lg"
                accentColor={accent}
                disabled={executiveReview.isPending}
                onClick={() => executiveReview.mutate('APPROVE')}
              >
                Approve & send to Coordinator
              </Button>
              <Button
                variant="ghost"
                size="lg"
                disabled={executiveReview.isPending}
                onClick={() => executiveReview.mutate('RETURN')}
              >
                Return to PM
              </Button>
            </div>
          )}
          {isCoordinatorVerify && (
            <div className="flex flex-col gap-2">
              <Button
                variant="accent"
                size="lg"
                accentColor={accent}
                disabled={verify.isPending}
                onClick={() => verify.mutate('APPROVE')}
              >
                Verify & send to Chairman
              </Button>
              <Button
                variant="ghost"
                size="lg"
                disabled={verify.isPending}
                onClick={() => verify.mutate('RETURN')}
              >
                Return to Executive
              </Button>
            </div>
          )}
          {canFinalApprove && (
            <div className="flex flex-col gap-2">
              <Button
                variant="accent"
                size="lg"
                accentColor={accent}
                disabled={approve.isPending}
                onClick={() => approve.mutate()}
              >
                Approve work order
              </Button>
              <Button
                variant="destructive"
                size="lg"
                disabled={!note.trim() || reject.isPending}
                onClick={() => reject.mutate()}
              >
                Reject
              </Button>
            </div>
          )}
          {canAccept && (
            <Button
              variant="accent"
              size="lg"
              accentColor={accent}
              disabled={accept.isPending}
              onClick={() => accept.mutate()}
            >
              Record contractor acceptance
            </Button>
          )}
        </div>
      )}

      {canClose && (
        <div className="mt-6">
          <Button variant="accent" size="lg" className="w-full" onClick={() => closeWo.mutate()}>
            Close work order
          </Button>
        </div>
      )}
    </div>
  );
}
