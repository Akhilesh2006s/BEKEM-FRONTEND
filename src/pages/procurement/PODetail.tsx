import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Download } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import {
  ROLE_COLORS,
  UserRole,
  formatCurrency,
  type PurchaseOrderDto,
  type QuotationDto,
  type QuotationComparisonDto,
  formatProjectLabel,
} from '@afios/shared';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { PoEmailStatusChip } from '@/components/PoEmailStatusChip';
import { StatusTimeline } from '@/components/StatusTimeline';
import { OverrideRemarkModal } from '@/components/OverrideRemarkModal';
import { Textarea } from '@/components/ui/Input';
import { PoEditForm } from '@/components/PoEditForm';
import { SuccessScreen } from '@/components/SuccessScreen';
import { QuotationComparisonTable } from '@/components/QuotationComparisonTable';
import { forbiddenQueryOptions, isForbiddenError, useRedirectOnForbidden } from '@/lib/forbiddenRedirect';
import { getRoleHomePath } from '@/lib/rolePaths';
import { downloadExport } from '@/lib/downloadExport';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { PoTrackingTimeline } from '@/components/PoTrackingTimeline';
import { ProcurementRefField } from '@/components/ProcurementRefField';
import { FulfillmentStatusChip } from '@/components/FulfillmentStatusChip';
import { DetailField, DetailFieldGrid } from '@/components/ui/DetailFields';
import { useApprovalShortcuts } from '@/hooks/useApprovalShortcuts';
import { useApprovalLimits } from '@/hooks/useApprovalLimits';
import type { DelegationStatusDto, PoGrnsDto } from '@afios/shared';

const PO_PDF_AFTER_COORDINATOR_STATUSES = ['APPROVED'] as const;

function getNextStepInfo(po: PurchaseOrderDto) {
  switch (po.status) {
    case 'PM_PENDING':
      return {
        owner: 'Project Manager',
        step: 'Review and approve the PO before coordinator verification.',
      };
    case 'PENDING_REVIEW':
    case 'COORDINATOR_PENDING':
      return {
        owner: 'Coordinator',
        step: 'Verify pricing, documents, and routing before final approval.',
      };
    case 'PENDING_APPROVAL':
    case 'CHAIRMAN_PENDING':
      return {
        owner: 'Chairman',
        step: 'Give final approval so the PO can be issued to the vendor.',
      };
    case 'APPROVED':
      return {
        owner: po.emailStatus === 'sent' ? 'Vendor / Store' : 'Executive / Procurement team',
        step:
          po.emailStatus === 'sent'
            ? 'Vendor supplies the material. Store receives it through GRN, then issues it to site.'
            : 'Send the approved PO to the vendor, then wait for delivery and receive it through GRN.',
      };
    default:
      return null;
  }
}

export function PODetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user)!;
  const role = user.role as UserRole;
  const { data: approvalLimits } = useApprovalLimits();
  const [note, setNote] = useState('');
  const [editing, setEditing] = useState(false);
  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [done, setDone] = useState(false);
  const [doneMessage, setDoneMessage] = useState('');
  const [exporting, setExporting] = useState(false);

  const { data: delegationStatus } = useQuery({
    queryKey: ['delegation-status'],
    queryFn: async () => {
      const res = await api.get<{ data: DelegationStatusDto }>('/delegations/status');
      return res.data.data;
    },
  });

  const accent =
    role === UserRole.COORDINATOR
      ? ROLE_COLORS[UserRole.COORDINATOR].primary
      : role === UserRole.PROJECT_MANAGER
        ? ROLE_COLORS[UserRole.PROJECT_MANAGER].primary
        : role === UserRole.EXECUTIVE
          ? ROLE_COLORS[UserRole.EXECUTIVE].primary
          : ROLE_COLORS[UserRole.CHAIRMAN].primary;

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['purchase-order', id],
    queryFn: async () => {
      const res = await api.get<{
        data: PurchaseOrderDto;
        quotations: QuotationDto[];
        comparison?: QuotationComparisonDto | null;
        rfqId?: string | null;
        whyWeChoseThisVendor?: string;
        vendorSelectionReason?: string;
        selectedVendorId?: string | null;
      }>(`/purchase-orders/${id}`);
      return res.data;
    },
    enabled: !!id,
    ...forbiddenQueryOptions,
  });

  useRedirectOnForbidden(error);

  const { data: grnData } = useQuery({
    queryKey: ['po-grns', id],
    queryFn: async () => {
      const res = await api.get<{ data: PoGrnsDto }>(`/purchase-orders/${id}/grns`);
      return res.data.data;
    },
    enabled: !!id,
  });

  const verify = useMutation({
    mutationFn: (payload: { action: 'APPROVE' | 'RETURN' | 'CLARIFICATION' }) =>
      api.post(`/purchase-orders/${id}/verify`, {
        action: payload.action,
        note,
      }),
    onMutate: async (payload) => {
      await queryClient.cancelQueries({ queryKey: ['purchase-order', id] });
      const previous = queryClient.getQueryData<{ data: PurchaseOrderDto; quotations: QuotationDto[] }>([
        'purchase-order',
        id,
      ]);
      if (previous && payload.action === 'APPROVE') {
        const amount = Number(previous.data.amount || 0);
        const threshold = approvalLimits?.poCoordinatorMaxInr ?? 5000;
        const nextStatus = amount > threshold ? 'CHAIRMAN_PENDING' : 'APPROVED';
        queryClient.setQueryData(['purchase-order', id], {
          ...previous,
          data: { ...previous.data, status: nextStatus },
        });
      }
      return { previous };
    },
    onError: (e: Error & { response?: { data?: { message?: string } } }, _a, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(['purchase-order', id], ctx.previous);
      toast.error(e.response?.data?.message || 'Verification failed');
    },
    onSuccess: (res, payload) => {
      const status = (res as { data?: { data?: { status?: string } } })?.data?.data?.status;
      const msg =
        payload.action === 'APPROVE'
          ? status === 'CHAIRMAN_PENDING'
            ? 'Verified — sent to Chairman for final approval'
            : 'Purchase order approved'
          : payload.action === 'RETURN'
            ? 'Returned to Executive'
            : 'Clarification requested';
      setDoneMessage(msg);
      setDone(true);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-order', id] });
      queryClient.invalidateQueries({ queryKey: ['purchase-orders-browse'] });
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
    },
  });

  const pmApprove = useMutation({
    mutationFn: () => api.post(`/purchase-orders/${id}/pm-approve`, { note }),
    onSuccess: () => {
      setDoneMessage(po?.approvalRoutingNote || 'PO approved by Project Manager');
      setDone(true);
    },
    onError: (e: Error & { response?: { data?: { message?: string } } }) => {
      toast.error(e.response?.data?.message || 'PM approval failed');
    },
  });

  const approve = useMutation({
    mutationFn: () => api.post(`/purchase-orders/${id}/approve`, { note }),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['purchase-order', id] });
      const previous = queryClient.getQueryData<{ data: PurchaseOrderDto; quotations: QuotationDto[] }>([
        'purchase-order',
        id,
      ]);
      if (previous) {
        queryClient.setQueryData(['purchase-order', id], {
          ...previous,
          data: { ...previous.data, status: 'APPROVED' },
        });
      }
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(['purchase-order', id], ctx.previous);
      toast.error('Approval failed');
    },
    onSuccess: () => {
      setDoneMessage('Purchase order approved');
      setDone(true);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-order', id] });
      queryClient.invalidateQueries({ queryKey: ['purchase-orders-browse'] });
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
    },
  });

  const approveOverride = useMutation({
    mutationFn: (remark: string) =>
      api.post(`/purchase-orders/${id}/approve-override`, { remark }),
    onSuccess: () => {
      setShowOverrideModal(false);
      setDoneMessage('Approved in Chairman\'s absence');
      setDone(true);
    },
    onError: (e: Error & { response?: { data?: { message?: string } } }) => {
      toast.error(e.response?.data?.message || 'Override approval failed');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-order', id] });
      queryClient.invalidateQueries({ queryKey: ['purchase-orders-browse'] });
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
    },
  });

  const reject = useMutation({
    mutationFn: () => api.post(`/purchase-orders/${id}/reject`, { note }),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['purchase-order', id] });
      const previous = queryClient.getQueryData<{ data: PurchaseOrderDto; quotations: QuotationDto[] }>([
        'purchase-order',
        id,
      ]);
      if (previous) {
        queryClient.setQueryData(['purchase-order', id], {
          ...previous,
          data: { ...previous.data, status: 'REJECTED' },
        });
      }
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(['purchase-order', id], ctx.previous);
      toast.error('Rejection failed');
    },
    onSuccess: () => {
      setDoneMessage('Purchase order rejected');
      setDone(true);
    },
  });

  useApprovalShortcuts({
    enabled: !!data && !done && !isLoading,
    onApprove: () => {
      if (!data) return;
      const po = data.data;
      if (role === UserRole.COORDINATOR && po.status === 'PM_PENDING') {
        verify.mutate({ action: 'APPROVE' });
      } else if (
        role === UserRole.COORDINATOR &&
        (po.status === 'PENDING_REVIEW' || po.status === 'COORDINATOR_PENDING')
      ) {
        verify.mutate({ action: 'APPROVE' });
      } else if (
        (po.status === 'PENDING_APPROVAL' || po.status === 'CHAIRMAN_PENDING') &&
        (role === UserRole.CHAIRMAN || delegationStatus?.canActAsChairman)
      ) {
        approve.mutate();
      }
    },
    onReject: () => {
      if (!data) return;
      const po = data.data;
      if (
        role === UserRole.COORDINATOR &&
        (po.status === 'PENDING_REVIEW' || po.status === 'COORDINATOR_PENDING')
      ) {
        verify.mutate({ action: 'RETURN' });
      } else if (
        (po.status === 'PENDING_APPROVAL' || po.status === 'CHAIRMAN_PENDING') &&
        (role === UserRole.CHAIRMAN || delegationStatus?.canActAsChairman)
      ) {
        reject.mutate();
      }
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

  if (isError && isForbiddenError(error)) {
    return null;
  }

  if (!data) {
    return (
      <div className="px-4 pt-6">
        <div className="h-40 bg-gray-100 rounded-card animate-pulse" />
      </div>
    );
  }

  const po = data.data;
  const nextStep = getNextStepInfo(po);
  const chairmanThreshold = approvalLimits?.poCoordinatorMaxInr ?? 5000;
  const needsChairmanBand = po.amount > chairmanThreshold;
  const chairmanHasFinalApproved =
    po.status === 'APPROVED' && (needsChairmanBand || !!po.approvedAsChairmanOverride);
  const isCoordinator =
    role === UserRole.COORDINATOR &&
    (po.status === 'PENDING_REVIEW' ||
      po.status === 'COORDINATOR_PENDING' ||
      po.status === 'PM_PENDING');
  const isCoordinatorApproved =
    role === UserRole.COORDINATOR && po.status === 'APPROVED' && !chairmanHasFinalApproved;
  const canEditPo =
    (role === UserRole.COORDINATOR &&
      (['PENDING_REVIEW', 'COORDINATOR_PENDING', 'CHAIRMAN_PENDING'].includes(po.status) ||
        (po.status === 'APPROVED' && !chairmanHasFinalApproved))) ||
    (role === UserRole.CHAIRMAN &&
      ['PENDING_APPROVAL', 'CHAIRMAN_PENDING', 'APPROVED'].includes(po.status));
  const canChairmanEditException =
    role === UserRole.CHAIRMAN && po.status === 'APPROVED';
  const isCoordinatorOverride =
    role === UserRole.COORDINATOR &&
    needsChairmanBand &&
    ['PENDING_REVIEW', 'COORDINATOR_PENDING', 'CHAIRMAN_PENDING'].includes(po.status);
  const isPmApprover = false;
  const canFinalApprove =
    (po.status === 'PENDING_APPROVAL' || po.status === 'CHAIRMAN_PENDING') &&
    (role === UserRole.CHAIRMAN || delegationStatus?.canActAsChairman);
  const actingOnBehalf =
    role !== UserRole.CHAIRMAN && delegationStatus?.canActAsChairman
      ? delegationStatus.asDelegate.find((d: { scope: string; principal?: { name?: string } }) => d.scope === 'PO_FINAL')?.principal?.name
      : null;

  const canExportPdf =
    role !== UserRole.EXECUTIVE ||
    PO_PDF_AFTER_COORDINATOR_STATUSES.includes(
      po.status as (typeof PO_PDF_AFTER_COORDINATOR_STATUSES)[number]
    );

  const exportPdf = async () => {
    setExporting(true);
    try {
      await downloadExport(`/exports/purchase-orders/${po.id}.pdf`, `${po.poNumber}.pdf`);
      toast.success('PO exported');
    } catch {
      toast.error('Export failed');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className={cn('px-4 pt-4 pb-6 mx-auto', editing ? 'max-w-4xl' : 'max-w-lg')}>
      <header className="flex items-center gap-3 mb-3">
        <button
          onClick={() => navigate(-1)}
          className="h-10 w-10 flex items-center justify-center rounded-xl hover:bg-gray-100"
          aria-label="Go back"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="font-semibold">{po.poNumber}</h1>
          <div className="flex flex-wrap items-center gap-2 mt-1">
            <StatusBadge status={po.status} />
            {po.status === 'APPROVED' && (
              <FulfillmentStatusChip status={grnData?.fulfillmentStatus || po.fulfillmentStatus} />
            )}
            {po.approvedAsChairmanOverride && (
              <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                Approved in Chairman&apos;s absence
              </span>
            )}
          </div>
        </div>
        {canExportPdf && (
          <Button variant="ghost" size="sm" onClick={exportPdf} disabled={exporting}>
            <Download className="h-4 w-4" />
            PDF
          </Button>
        )}
      </header>

      {(po.procurementRef || po.poNumber) && (
        <ProcurementRefField value={po.procurementRef || po.poNumber || '—'} />
      )}

      {role === UserRole.EXECUTIVE && !canExportPdf && (
        <p className="text-xs text-ink-secondary bg-surface-muted border border-surface-border rounded-lg px-3 py-2 mb-4">
          PDF download unlocks after the coordinator approves this PO.
        </p>
      )}

      {po.approvedAsChairmanOverride && po.overrideRemark && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
          Override remark: {po.overrideRemark}
        </p>
      )}

      {po.status === 'APPROVED' && po.emailStatus && (
        <div className="mb-4">
          <PoEmailStatusChip status={po.emailStatus} sentAt={po.emailSentAt} />
        </div>
      )}

      {po.approvalRoutingNote && (
        <p className="text-xs text-sky-800 bg-sky-50 border border-sky-200 rounded-lg px-3 py-2 mb-4">
          {po.approvalRoutingNote}
        </p>
      )}

      {actingOnBehalf && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
          Acting on behalf of {actingOnBehalf}
        </p>
      )}

      {nextStep && (
        <div className="mb-4 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2">
          <p className="text-xs font-semibold text-sky-900">Next step / Owner</p>
          <p className="text-sm text-sky-950 mt-1">
            <span className="font-medium">{nextStep.owner}</span> · {nextStep.step}
          </p>
        </div>
      )}

      <Card className="mb-3">
        <DetailFieldGrid>
          <DetailField label="Vendor (To)" fullWidth valueClassName="font-medium">
            <span>{po.vendor?.name}</span>
            {po.vendor?.address && (
              <p className="text-xs text-gray-600 whitespace-pre-line mt-1 font-normal">
                {po.vendor.address}
              </p>
            )}
            {po.vendor?.gstNumber && (
              <p className="text-xs text-gray-500 mt-1 font-normal">GST: {po.vendor.gstNumber}</p>
            )}
          </DetailField>
          <DetailField label="Amount" valueClassName="text-lg">
            {formatCurrency(po.amount)}
          </DetailField>
          <DetailField label="Payment terms">{po.paymentTerms}</DetailField>
          {po.billingAddress && (
            <DetailField label="Buyer's address" fullWidth valueClassName="text-sm font-normal whitespace-pre-line">
              {po.billingAddress}
            </DetailField>
          )}
          {po.deliveryAddress && (
            <DetailField
              label="Consignee (store site)"
              fullWidth
              valueClassName="text-sm font-normal whitespace-pre-line"
            >
              {po.deliveryAddress}
            </DetailField>
          )}
          {po.purchaseRequest?.project && (
            <DetailField label="Project">
              {formatProjectLabel(po.purchaseRequest.project)}
            </DetailField>
          )}
          {po.purchaseRequest?.prNumber && (
            <DetailField label="Purchase request">{po.purchaseRequest.prNumber}</DetailField>
          )}
        </DetailFieldGrid>
      </Card>

      {po.lineItems && po.lineItems.length > 0 && (
        <div className="mb-3">
          <h2 className="font-semibold text-sm mb-2">Line items</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {(po.lineItems ?? []).map((item, idx) => (
              <Card key={item.id || idx} className="py-2">
                <p className="text-sm font-medium">{item.description}</p>
                <p className="text-xs text-gray-500 mt-1">
                  {item.quantity}
                  {item.unit ? ` ${item.unit}` : ''} × {formatCurrency(item.rate)} ={' '}
                  {formatCurrency(item.amount)}
                </p>
              </Card>
            ))}
          </div>
        </div>
      )}

      {(data.comparison?.itemComparisons?.length || data.comparison?.vendors?.length || data.quotations?.length) ? (
        <div className="mb-3">
          <div className="flex items-center justify-between gap-2 mb-2">
            <h2 className="font-semibold text-sm">Vendor quotations by item</h2>
            {data.rfqId && (
              <button
                type="button"
                className="text-xs font-medium text-bekem-accent hover:underline"
                onClick={() => navigate(`/rfqs/${data.rfqId}`)}
              >
                View source RFQ
              </button>
            )}
          </div>
          <p className="text-xs text-ink-secondary mb-2">
            For each PO line, vendors who quoted that item and their rates. L1 = lowest quote; On PO =
            vendor on this purchase order.
          </p>
          {(data.whyWeChoseThisVendor || data.vendorSelectionReason) && (
            <Card className="py-2 mb-2 space-y-1">
              {data.whyWeChoseThisVendor && (
                <p className="text-xs text-ink-secondary">
                  <span className="font-semibold text-ink">Why this vendor: </span>
                  {data.whyWeChoseThisVendor}
                </p>
              )}
              {data.vendorSelectionReason && (
                <p className="text-xs text-ink-secondary">
                  <span className="font-semibold text-ink">Non-L1 reason: </span>
                  {data.vendorSelectionReason}
                </p>
              )}
            </Card>
          )}
          {data.comparison ? (
            <QuotationComparisonTable
              comparison={data.comparison}
              selectedVendorId={data.selectedVendorId || po.vendorId}
            />
          ) : (
            <div className="space-y-2">
              {(data.quotations ?? []).map((q) => (
                <Card key={q.id} className="py-2 flex justify-between">
                  <span className="text-sm">{q.vendor?.name}</span>
                  <span className="font-medium text-sm">{formatCurrency(q.amount)}</span>
                </Card>
              ))}
            </div>
          )}
        </div>
      ) : null}

      <h2 className="font-semibold text-sm mb-3">PO tracking</h2>
      <PoTrackingTimeline poId={po.id} className="mb-3" />

      <h2 className="font-semibold text-sm mb-3">Approval history</h2>
      <StatusTimeline entityType="PurchaseOrder" entityId={po.id} />

      {po.status === 'APPROVED' && grnData && (
        <div className="mt-6 space-y-3">
          <h2 className="font-semibold text-sm">Goods receipt notes</h2>
          {grnData.paymentSummary && grnData.paymentSummary.billCount > 0 && (
            <div className="rounded-xl border border-surface-border bg-surface-muted/40 p-3 text-sm grid sm:grid-cols-2 gap-2">
              <span>
                Invoiced: {formatCurrency(grnData.paymentSummary.totalInvoiced)}
              </span>
              <span>Paid: {formatCurrency(grnData.paymentSummary.totalPaid)}</span>
              <span>
                Outstanding: {formatCurrency(grnData.paymentSummary.totalOutstanding)}
              </span>
              <span className="capitalize">
                Payment: {grnData.paymentSummary.paymentStatus.toLowerCase()}
              </span>
            </div>
          )}
          {!(grnData.grns?.length) ? (
            <p className="text-sm text-ink-muted">No GRNs recorded yet.</p>
          ) : (
            <div className="space-y-2">
              {(grnData.grns ?? []).map((g) => (
                <Card key={g.id} className="py-3">
                  <div className="flex justify-between items-start gap-2">
                    <div>
                      <p className="font-medium text-sm">{g.grnNumber}</p>
                      <p className="text-xs text-ink-muted">
                        {g.receivedAt ? new Date(g.receivedAt).toLocaleDateString('en-IN') : '—'}
                        {g.invoiceNo ? ` · Inv ${g.invoiceNo}` : ''}
                        {g.billNumber ? ` · ${g.billNumber}` : ''}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <StatusBadge status={g.status} />
                      {g.status === 'ON_HOLD' && g.approvalStage && g.approvalStage !== 'APPROVED' && (
                        <span className="text-[10px] font-semibold uppercase text-amber-700">
                          {g.approvalStage === 'COORDINATOR_PENDING'
                            ? 'Awaiting coordinator'
                            : g.approvalStage === 'CHAIRMAN_PENDING'
                              ? 'Awaiting MD'
                              : g.approvalStage.replace(/_/g, ' ').toLowerCase()}
                        </span>
                      )}
                      {g.holdReasons?.length ? (
                        <span className="text-[10px] text-ink-muted">
                          {g.holdReasons.join(' · ')} variance
                        </span>
                      ) : null}
                      {g.isPartialGrn && (
                        <span className="text-[10px] font-bold text-red-600 uppercase">Partial GRN</span>
                      )}
                      {g.paymentStatus && (
                        <span className="text-[10px] font-semibold uppercase text-ink-secondary">
                          {g.paymentStatus}
                          {g.outstandingAmount != null
                            ? ` · ${formatCurrency(g.outstandingAmount)} due`
                            : ''}
                        </span>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {(isCoordinator || isCoordinatorOverride || canFinalApprove || isPmApprover || isCoordinatorApproved || canChairmanEditException) && (
        <div className="mt-6 space-y-3">
          {grnData?.grns?.length ? (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              This PO has {grnData.grns.length} recorded GRN(s). Line quantity or rate changes may
              conflict with receipts — the server will warn before saving.
            </p>
          ) : null}
          {canEditPo && !editing && (
            <div className="flex flex-wrap gap-2">
              {role === UserRole.COORDINATOR && (
                <Button
                  variant={po.status === 'APPROVED' ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={() => setEditing(true)}
                >
                  {po.status === 'APPROVED' ? 'Modify / Correct PO' : 'Edit PO'}
                </Button>
              )}
              {role === UserRole.CHAIRMAN && (
                <Button
                  variant={po.status === 'APPROVED' ? 'ghost' : 'secondary'}
                  size="sm"
                  className={po.status === 'APPROVED' ? 'text-ink-muted' : undefined}
                  onClick={() => setEditing(true)}
                >
                  {po.status === 'APPROVED' ? 'Edit (exception)' : 'Edit PO'}
                </Button>
              )}
            </div>
          )}
          {editing && (
            <PoEditForm
              po={po}
              onCancel={() => setEditing(false)}
              onSaved={() => {
                setEditing(false);
                queryClient.invalidateQueries({ queryKey: ['purchase-order', id] });
              }}
            />
          )}
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note or reason…"
          />
          {isPmApprover && (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-ink-secondary">
                {po?.approvalRoutingNote || 'You are the final approver for this PO (PM band).'}
              </p>
              <Button
                variant="accent"
                size="lg"
                accentColor={ROLE_COLORS[UserRole.PROJECT_MANAGER].primary}
                disabled={pmApprove.isPending}
                onClick={() => pmApprove.mutate()}
              >
                Approve PO (PM)
              </Button>
            </div>
          )}
          {isCoordinator && (
            <div className="flex flex-col gap-2">
              <Button
                variant="accent"
                size="lg"
                accentColor={accent}
                disabled={verify.isPending}
                onClick={() => verify.mutate({ action: 'APPROVE' })}
              >
                {needsChairmanBand ? 'Verify & send to Chairman' : 'Verify & approve PO'}
              </Button>
              {needsChairmanBand && (
                <>
                  <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    Chairman not on premises? Approve here with a mandatory written reason (min 30
                    characters) — permanently audited.
                  </p>
                  <Button
                    variant="secondary"
                    size="lg"
                    className="border-amber-300 text-amber-900"
                    onClick={() => setShowOverrideModal(true)}
                  >
                    Approve (Chairman unavailable)
                  </Button>
                </>
              )}
              <Button
                variant="secondary"
                size="lg"
                disabled={verify.isPending}
                onClick={() => verify.mutate({ action: 'CLARIFICATION' })}
              >
                Request clarification
              </Button>
              <Button
                variant="ghost"
                size="lg"
                disabled={verify.isPending || !note.trim()}
                onClick={() => verify.mutate({ action: 'RETURN' })}
              >
                Return to Executive
              </Button>
            </div>
          )}
          {isCoordinatorOverride && po.status === 'CHAIRMAN_PENDING' && (
            <div className="flex flex-col gap-2 border-t border-surface-border pt-3">
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                PO is with Chairman. If Chairman is unavailable, approve with a mandatory remark
                (min 30 characters) — permanently audited.
              </p>
              <Button
                variant="secondary"
                size="lg"
                className="border-amber-300 text-amber-900"
                onClick={() => setShowOverrideModal(true)}
              >
                Approve (Chairman unavailable)
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
                Approve PO
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
        </div>
      )}

      <OverrideRemarkModal
        open={showOverrideModal}
        onClose={() => setShowOverrideModal(false)}
        pending={approveOverride.isPending}
        onSubmit={(remark) => approveOverride.mutate(remark)}
      />
    </div>
  );
}
