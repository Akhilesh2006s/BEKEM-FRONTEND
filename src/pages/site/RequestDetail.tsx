import { useState, useEffect } from 'react';
import { useNavigate, useParams, Navigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Copy, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { approvalCapDayKey } from '@/lib/approvalCapDay';
import { forbiddenQueryOptions, isForbiddenError, useRedirectOnForbidden } from '@/lib/forbiddenRedirect';
import { useAuthStore } from '@/stores/authStore';
import {
  formatDate,
  formatCurrency,
  formatQuantity,
  ROLE_COLORS,
  UserRole,
  hideIndentPricingForRole,
  INDENT_REQUEST_TYPE_LABELS,
  canEditIndentOneLevelAhead,
  formatProjectLabel,
  indentExceedsPmApprovalLevel,
  PM_ABOVE_APPROVAL_LEVEL_MESSAGE,
} from '@afios/shared';
import type {
  MaterialRequestDto,
  UpdateIndentDto,
  CreateIndentBranchTransfersDto,
  BranchTransferDto,
  DailyCapDto,
} from '@afios/shared';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { StatusTimeline } from '@/components/StatusTimeline';
import { Input, Textarea } from '@/components/ui/Input';
import { StockComparisonTable } from '@/components/StockComparisonTable';
import {
  CrossProjectStockPanel,
  otherProjectSitesWithStock,
  takeKey,
  buildBatchSources,
} from '@/components/CrossProjectStockPanel';
import { StockAcrossProjectsDropdown } from '@/components/StockAcrossProjectsDropdown';
import { PmDailyCapBanner, CoordinatorDailyCapBanner } from '@/components/PmDailyCapBanner';
import { useApprovalShortcuts } from '@/hooks/useApprovalShortcuts';
import { DetailField, DetailFieldGrid } from '@/components/ui/DetailFields';
import { formatIndentQueueStatus, isInAllocationReview, isCurrentAllocationOwner, resolveAllocationReviewStage } from '@/components/MaterialIndentsTable';
import { QuantityStepper } from '@/components/QuantityStepper';
import { newIdempotencyKey, idempotencyHeaders } from '@/lib/idempotency';

const CLOSED_INDENT_BT = ['REJECTED', 'RAISE_PO_INSTEAD'];

function qtyCoveredByTransfers(transfers: BranchTransferDto[] | undefined, materialId: string) {
  return (transfers || [])
    .filter((t) => !CLOSED_INDENT_BT.includes(t.status))
    .flatMap((t) => t.items || [])
    .filter((item) => item.materialId === materialId)
    .reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
}

export function RequestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const role = user?.role as UserRole;
  const accent = ROLE_COLORS[UserRole.PROJECT_MANAGER].primary;
  const [pmRemark, setPmRemark] = useState('');
  const [pmRemarkError, setPmRemarkError] = useState('');
  const [editing, setEditing] = useState(false);
  const [editPurpose, setEditPurpose] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [editRequestedByName, setEditRequestedByName] = useState('');
  const [editRequiredByDate, setEditRequiredByDate] = useState('');
  const [editQty, setEditQty] = useState(0);
  const [editUnit, setEditUnit] = useState('Nos');
  const [takeQtyByKey, setTakeQtyByKey] = useState<Record<string, number>>({});

  const { data: request, isLoading, isError, error } = useQuery({
    queryKey: ['material-request', id],
    queryFn: async () => {
      const res = await api.get<{ data: MaterialRequestDto }>(`/material-requests/${id}`);
      return res.data.data;
    },
    enabled: !!id,
    ...forbiddenQueryOptions,
  });

  const { data: coordinatorCap } = useQuery({
    queryKey: ['coordinator-daily-cap', approvalCapDayKey()],
    queryFn: async () => {
      const res = await api.get<{ data: DailyCapDto }>('/material-requests/coordinator/daily-cap');
      return res.data.data;
    },
    enabled: role === UserRole.COORDINATOR,
    refetchInterval: 30_000,
  });

  const { data: pmDailyCap } = useQuery({
    queryKey: ['pm-daily-cap', approvalCapDayKey()],
    queryFn: async () => {
      const res = await api.get<{ data: DailyCapDto }>('/material-requests/pm/daily-cap');
      return res.data.data;
    },
    enabled: role === UserRole.PROJECT_MANAGER,
    refetchInterval: 30_000,
  });

  useRedirectOnForbidden(error);

  useEffect(() => {
    if (!request) return;
    setEditPurpose(request.purpose || '');
    setEditLocation(request.location || '');
    setEditRequestedByName(request.requestedByName || request.requester?.name || '');
    setEditRequiredByDate(
      request.requiredByDate ? String(request.requiredByDate).slice(0, 10) : ''
    );
    const first = request.items?.[0];
    setEditQty(first?.quantityRequested ?? request.quantityRequested ?? 0);
    setEditUnit(first?.unit || first?.material?.unit || 'Nos');
  }, [request]);

  useEffect(() => {
    setTakeQtyByKey({});
  }, [request?.id]);

  const saveIndent = useMutation({
    mutationFn: async (payload: UpdateIndentDto) => {
      const res = await api.patch<{ data: MaterialRequestDto }>(`/material-requests/${id}`, payload);
      return res.data.data;
    },
    onSuccess: () => {
      toast.success('Indent updated');
      setEditing(false);
      queryClient.invalidateQueries({ queryKey: ['material-request', id] });
      queryClient.invalidateQueries({ queryKey: ['material-requests'] });
    },
    onError: (err: Error & { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message || 'Could not update indent');
    },
  });

  const pmLocalClose = useMutation({
    mutationFn: async (remark: string) => {
      const res = await api.post<{ data: MaterialRequestDto }>(
        `/material-requests/${id}/pm-local-close`,
        { remark }
      );
      return res.data.data;
    },
    onSuccess: (data) => {
      toast.success(
        data.status === 'ALLOCATED'
          ? 'Closed at PM — stock reserved for Store to issue'
          : 'Approved'
      );
      setPmRemark('');
      queryClient.invalidateQueries({ queryKey: ['material-request', id] });
      queryClient.invalidateQueries({ queryKey: ['pm-approvals'] });
      queryClient.invalidateQueries({ queryKey: ['pm-daily-cap'] });
    },
    onError: (err: Error & { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message || 'Could not approve');
    },
  });

  const proceedAllocation = useMutation({
    mutationFn: async (remark: string) => {
      const res = await api.post<{ data: MaterialRequestDto }>(
        `/material-requests/${id}/proceed-allocation`,
        { remark }
      );
      return res.data.data;
    },
    onSuccess: (data) => {
      const next = data.allocationReviewStage;
      toast.success(
        next === 'PROJECT_MANAGER'
          ? 'Proceeded with allocation — sent to Project Manager'
          : next === 'STORE_INCHARGE'
            ? data.status === 'ALLOCATED'
              ? 'Proceeded with allocation — stock reserved for Store to issue'
              : 'Proceeded with allocation — sent to Store In-Charge'
            : data.status === 'ISSUED'
              ? 'Allocated to indent raiser — they can collect & verify'
              : 'Proceeded with allocation'
      );
      setPmRemark('');
      queryClient.invalidateQueries({ queryKey: ['material-request', id] });
      queryClient.invalidateQueries({ queryKey: ['material-requests'] });
      queryClient.invalidateQueries({ queryKey: ['pm-approvals'] });
    },
    onError: (err: Error & { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message || 'Could not proceed with allocation');
    },
  });

  const coordinatorLocalClose = useMutation({
    mutationFn: async (remark: string) => {
      const res = await api.post<{
        data: MaterialRequestDto;
        escalated?: boolean;
        message?: string;
      }>(`/material-requests/${id}/coordinator-local-close`, { remark });
      return res.data;
    },
    onSuccess: (data) => {
      if (data.escalated) {
        toast.info(data.message || 'Escalated to MD / Chairman — daily cap exceeded');
      } else {
        toast.success(
          data.data?.status === 'ALLOCATED'
            ? 'Closed at Coordinator — stock reserved for Store to issue'
            : 'Approved at Coordinator — no MD escalation'
        );
      }
      setPmRemark('');
      queryClient.invalidateQueries({ queryKey: ['material-request', id] });
      queryClient.invalidateQueries({ queryKey: ['coordinator-daily-cap'] });
      queryClient.invalidateQueries({ queryKey: ['procurement-decisions'] });
    },
    onError: (err: Error & { response?: { data?: { message?: string; escalated?: boolean } } }) => {
      toast.error(err.response?.data?.message || 'Could not approve at Coordinator');
      if (err.response?.data?.escalated) {
        queryClient.invalidateQueries({ queryKey: ['material-request', id] });
        queryClient.invalidateQueries({ queryKey: ['coordinator-daily-cap'] });
      }
    },
  });

  const forwardToHo = useMutation({
    mutationFn: async (remark: string) => {
      const res = await api.post<{ data: MaterialRequestDto; message?: string }>(
        `/material-requests/${id}/forward-to-ho`,
        { remark }
      );
      return res.data;
    },
    onSuccess: (data) => {
      toast.success(data.message || 'Forwarded to Head Office for further approval');
      setPmRemark('');
      queryClient.invalidateQueries({ queryKey: ['material-request', id] });
      queryClient.invalidateQueries({ queryKey: ['pm-approvals'] });
    },
    onError: (err: Error & { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message || 'Could not forward to Head Office');
    },
  });

  const requestBranchTransfers = useMutation({
    mutationFn: async (payload: CreateIndentBranchTransfersDto) => {
      const res = await api.post<{
        data: { transfers: Array<{ id: string; transferNumber: string }> };
      }>('/branch-transfers/batch', payload, {
        headers: idempotencyHeaders(newIdempotencyKey(`bt-batch:${id}`)),
      });
      return res.data.data;
    },
    onSuccess: (data) => {
      const numbers = data.transfers.map((t) => t.transferNumber).join(', ');
      toast.success(
        data.transfers.length === 1
          ? `Branch transfer ${numbers} sent to Head Office for approval`
          : `${data.transfers.length} branch transfers sent to Head Office (${numbers})`
      );
      setPmRemark('');
      setTakeQtyByKey({});
      queryClient.invalidateQueries({ queryKey: ['material-request', id] });
      queryClient.invalidateQueries({ queryKey: ['pm-approvals'] });
      queryClient.invalidateQueries({ queryKey: ['pm-branch-transfer-requests'] });
    },
    onError: (err: Error & { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message || 'Could not request branch transfer');
    },
  });

  const confirmReceipt = useMutation({
    mutationFn: () => api.post(`/material-requests/${id}/confirm-receipt`, {}),
    onSuccess: () => {
      toast.success('Stock verified — request completed');
      queryClient.invalidateQueries({ queryKey: ['material-request', id] });
      queryClient.invalidateQueries({ queryKey: ['material-requests'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-today'] });
      navigate('/incidents?tab=completed');
    },
    onError: (err: Error & { response?: { data?: { message?: string }; status?: number } }) => {
      toast.error(err.response?.data?.message || 'Could not confirm material receipt');
    },
  });

  const pmCanActOnIndent =
    !!request &&
    role === UserRole.PROJECT_MANAGER &&
    ['FORWARDED_TO_PM', 'BRANCH_TRANSFER_REQUESTED'].includes(request.status) &&
    !request.escalatedToHo;
  const storeReadyToAllocate =
    role === UserRole.STORE_INCHARGE && request?.status === 'MATERIAL_RECEIVED';
  const showProceedAllocationPanel = Boolean(
    request &&
      (([UserRole.EXECUTIVE, UserRole.PROJECT_MANAGER].includes(role) &&
        isInAllocationReview(request)) ||
        storeReadyToAllocate)
  );
  const canClickProceedAllocation = Boolean(
    request &&
      (storeReadyToAllocate ||
        ([UserRole.EXECUTIVE, UserRole.PROJECT_MANAGER].includes(role) &&
          isCurrentAllocationOwner(request, role)))
  );
  const allocationStage = request ? resolveAllocationReviewStage(request) : null;
  const allocationOwnerLabel =
    allocationStage === UserRole.EXECUTIVE
      ? 'Executive'
      : allocationStage === UserRole.PROJECT_MANAGER
        ? 'Project Manager'
        : allocationStage === UserRole.STORE_INCHARGE
          ? 'Store In-Charge'
          : 'current owner';
  const proceedAllocationHint = storeReadyToAllocate
    ? 'Stock received. Proceed with Allocation to allocate this indent to the indent raiser.'
    : allocationStage === UserRole.EXECUTIVE
      ? 'PO is approved. Proceed with Allocation to send this indent to the Project Manager.'
      : allocationStage === UserRole.PROJECT_MANAGER
        ? 'Executive proceeded with allocation. Proceed with Allocation to send this indent to Store In-Charge.'
        : 'PM proceeded with allocation. Proceed with Allocation to issue materials to the indent raiser.';
  const canPmDecide = Boolean(pmCanActOnIndent && request?.status === 'FORWARDED_TO_PM');
  /** Live stock check only — storeStockVerified alone must not allow a PM close. */
  const stockAvailable = Boolean(request?.canFullyIssue);
  const isBelowCap = request?.indentRequestType === 'BELOW_5000';
  const indentTakeLines = (
    request?.items?.length
      ? request.items
      : request?.materialId
        ? [{ materialId: request.materialId, quantityRequested: request.quantityRequested || 0 }]
        : []
  ).map((item) => ({
    materialId: item.materialId,
    quantityRequested: item.quantityRequested || 0,
  }));
  const requestedByMaterial: Record<string, number> = {};
  for (const line of indentTakeLines) {
    if (!line.materialId) continue;
    requestedByMaterial[line.materialId] =
      (requestedByMaterial[line.materialId] || 0) + line.quantityRequested;
  }
  const alreadyCoveredByMaterial: Record<string, number> = {};
  for (const materialId of Object.keys(requestedByMaterial)) {
    alreadyCoveredByMaterial[materialId] = qtyCoveredByTransfers(
      request?.linkedBranchTransfers,
      materialId
    );
  }
  const totalRequested = Object.values(requestedByMaterial).reduce((sum, qty) => sum + qty, 0);
  const totalAlready = Object.values(alreadyCoveredByMaterial).reduce((sum, qty) => sum + qty, 0);
  const totalTaking = Object.values(takeQtyByKey).reduce((sum, qty) => sum + (Number(qty) || 0), 0);
  const remainingAfterExisting = Math.max(0, totalRequested - totalAlready);
  const remainingAfterTakes = Math.max(0, remainingAfterExisting - totalTaking);
  const lockedSiteIds = (request?.linkedBranchTransfers || [])
    .filter((t) => !CLOSED_INDENT_BT.includes(t.status) && t.fromSiteId)
    .map((t) => t.fromSiteId as string);
  const otherStockAvailable = otherProjectSitesWithStock(
    request?.crossProjectStock || [],
    request?.projectId
  ).some((site) => !lockedSiteIds.includes(site.siteId));
  const showBranchTransfer = Boolean(
    pmCanActOnIndent && !stockAvailable && otherStockAvailable && remainingAfterExisting > 0
  );
  const exceedsPmApprovalLevel = indentExceedsPmApprovalLevel(
    request?.estimatedValue,
    request?.indentRequestType
  );
  /** Remaining shortfall after takes / existing BTs still goes to Head Office.
   *  Indents above the PM per-indent approval limit also go to HO even when stock is available. */
  const showForwardToHo = Boolean(
    pmCanActOnIndent &&
      remainingAfterTakes > 0 &&
      totalTaking === 0 &&
      (!stockAvailable || exceedsPmApprovalLevel)
  );
  const showPmApprove = Boolean(canPmDecide && stockAvailable && !exceedsPmApprovalLevel);
  const showPmDecisionPanel = Boolean(
    pmCanActOnIndent && (showPmApprove || remainingAfterExisting > 0 || exceedsPmApprovalLevel)
  );
  /** Daily cap is a separate check — only for indents still within the PM per-indent limit. */
  const wouldExceedPmCap = Boolean(
    !isBelowCap &&
      !exceedsPmApprovalLevel &&
      pmDailyCap &&
      pmDailyCap.dailyApprovedTotal + (request?.estimatedValue || 0) > pmDailyCap.dailyCap
  );
  const pmApproveClosesAtPm = showPmApprove && !wouldExceedPmCap;

  useApprovalShortcuts({
    enabled: showPmApprove && !isLoading,
    onApprove: () => {
      if (!pmRemark.trim()) {
        setPmRemarkError('Remark is required');
        return;
      }
      pmLocalClose.mutate(pmRemark.trim());
    },
  });

  if (isLoading) {
    return (
      <div className="px-4 pt-6 space-y-3">
        <div className="h-8 w-48 bg-gray-100 rounded animate-pulse" />
        <div className="h-40 bg-gray-100 rounded-card animate-pulse" />
      </div>
    );
  }

  if (isError && isForbiddenError(error)) {
    return null;
  }

  if (!request) return null;

  // Store pending actions live on AllocateFlow (Allocation Request / Stock requisition).
  if (role === UserRole.STORE_INCHARGE && request.status === 'PENDING_STORE') {
    return <Navigate to={`/store/allocate/${request.id}`} replace />;
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
            location: request.location || '',
            requiredByDate: request.requiredByDate || null,
            material: request.material,
            requestedQty: request.items?.[0]?.requestedQty,
            availableQty: request.items?.[0]?.availableQty,
            requiredQty: request.items?.[0]?.requiredQty,
          },
        ]
      : [];

  const canHoReview =
    [UserRole.EXECUTIVE, UserRole.COORDINATOR].includes(role) &&
    ['PENDING_HO', 'PENDING_EXECUTIVE_DECISION', 'EXECUTIVE_DECISION_PO', 'EXECUTIVE_DECISION_BRANCH_TRANSFER'].includes(
      request.status
    );
  const showProcurementTrace =
    [UserRole.EXECUTIVE, UserRole.COORDINATOR].includes(role) &&
    Boolean(
      request.purchaseRequestId ||
        request.rfqId ||
        request.poId ||
        canHoReview
    );
  const canCoordinatorLocalClose =
    role === UserRole.COORDINATOR &&
    [
      'PENDING_HO',
      'PENDING_EXECUTIVE_DECISION',
      'EXECUTIVE_DECISION_PO',
      'EXECUTIVE_DECISION_BRANCH_TRANSFER',
      'HO_PENDING_COORDINATOR',
    ].includes(request.status) &&
    !request.escalatedToChairman;
  const coordinatorCanCloseWithinCap =
    canCoordinatorLocalClose &&
    (coordinatorCap
      ? (request.estimatedValue || 0) <= coordinatorCap.remaining
      : true);
  const awaitingDecision = ['PENDING_HO', 'PENDING_EXECUTIVE_DECISION'].includes(request.status);
  const canConfirmReceipt = role === UserRole.SITE_INCHARGE && request.status === 'ISSUED';
  const hidePricing = hideIndentPricingForRole(role, request.indentRequestType);
  const isIndentRaiser = role === UserRole.SITE_INCHARGE;
  const showAvailableToIssue = !isIndentRaiser;
  const canEdit =
    request.canEdit === true || canEditIndentOneLevelAhead(role, request.status);

  const requirePmRemark = () => {
    if (!pmRemark.trim()) {
      setPmRemarkError('Remark is required');
      return false;
    }
    setPmRemarkError('');
    return true;
  };

  return (
    <div className="px-4 pt-4 pb-6 max-w-3xl mx-auto">
      <header className="flex items-center gap-3 mb-3">
        <button
          onClick={() => navigate(-1)}
          className="h-10 w-10 flex items-center justify-center rounded-xl hover:bg-gray-100"
          aria-label="Go back"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="font-semibold text-gray-900 truncate">{request.indentNumber}</h1>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(request.indentNumber);
                toast.success('Request ID copied');
              }}
              className="shrink-0 h-8 w-8 flex items-center justify-center rounded-lg text-ink-muted hover:text-ink hover:bg-surface-muted"
              aria-label="Copy request ID"
            >
              <Copy className="h-4 w-4" />
            </button>
          </div>
          <StatusBadge
            status={request.status}
            label={formatIndentQueueStatus(
              request.status,
              request.pendingWith,
              request.approverNames,
              request.poStatus,
              request.pmProceededAllocation,
              request.allocationReviewStage,
              request.allocatedByRole
            )}
            className="mt-1"
          />
        </div>
        {canEdit && !editing && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setEditing(true)}
          >
            <Pencil className="h-3.5 w-3.5" />
            Modify
          </Button>
        )}
      </header>

      {canEdit && (
        <p className="mb-3 text-[11px] text-ink-secondary rounded-lg border border-surface-border bg-surface-muted/40 px-3 py-2">
          You can modify this indent only while it is pending one level ahead. Once it moves further
          (e.g. Store → PM), edit will lock for your role.
        </p>
      )}

      {canPmDecide && !isBelowCap && !exceedsPmApprovalLevel && showPmApprove && (
        <PmDailyCapBanner cap={pmDailyCap} />
      )}

      {canCoordinatorLocalClose && <CoordinatorDailyCapBanner cap={coordinatorCap} />}

      {request.escalatedToChairman && (
        <div className="mb-4 rounded-xl border border-warning/30 bg-warning/5 px-3 py-2 text-sm">
          This indent was escalated to MD / Chairman — it exceeds the Coordinator&apos;s
          configurable daily approval limit (see Admin settings).
        </div>
      )}

      {request.escalatedToHo && !isBelowCap && (
        <div className="mb-4 rounded-xl border border-warning/30 bg-warning/5 px-3 py-2 text-sm">
          This indent was forwarded to Head Office for further approval.
        </div>
      )}

      {editing ? (
        <Card className="mb-3 space-y-3 p-3">
          <p className="text-sm font-semibold text-ink">Modify indent</p>
          {(request.project?.name || request.project?.code) && (
            <div>
              <label className="text-xs font-semibold text-ink-muted mb-1 block">Project</label>
              <p className="text-sm font-medium text-ink">{formatProjectLabel(request.project)}</p>
            </div>
          )}
          <div>
            <label className="text-xs font-semibold text-ink-muted mb-1 block">Requested by</label>
            <Input
              value={editRequestedByName}
              onChange={(e) => setEditRequestedByName(e.target.value)}
              className="text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-ink-muted mb-1 block">Reason for request</label>
            <Input
              value={editPurpose}
              onChange={(e) => setEditPurpose(e.target.value)}
              className="text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-ink-muted mb-1 block">Location</label>
            <Input
              value={editLocation}
              onChange={(e) => setEditLocation(e.target.value)}
              className="text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-ink-muted mb-1 block">Required by date</label>
            <Input
              type="date"
              value={editRequiredByDate}
              onChange={(e) => setEditRequiredByDate(e.target.value)}
              className="text-sm"
            />
          </div>
          {request.items?.[0] && (
            <div className="rounded-xl border border-surface-border p-3 space-y-2">
              <p className="text-sm font-medium text-ink">
                {request.items[0].material?.name || 'Product'}
              </p>
              <div className="grid grid-cols-2 gap-2 items-end">
                <QuantityStepper
                  size="compact"
                  value={editQty}
                  onChange={setEditQty}
                  min={0}
                  unit={editUnit}
                  accentColor={accent}
                />
                <div>
                  <label className="text-xs font-semibold text-ink-muted mb-1 block">Unit</label>
                  <Input value={editUnit} onChange={(e) => setEditUnit(e.target.value)} className="text-sm" />
                </div>
              </div>
            </div>
          )}
          <div className="flex gap-2">
            <Button variant="ghost" className="flex-1" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              className="flex-1"
              disabled={
                saveIndent.isPending ||
                !editPurpose.trim() ||
                !editRequestedByName.trim() ||
                editQty <= 0
              }
              onClick={() => {
                const first = request.items?.[0];
                const payload: UpdateIndentDto = {
                  purpose: editPurpose.trim(),
                  requestedByName: editRequestedByName.trim(),
                  location: editLocation.trim(),
                  requiredByDate: editRequiredByDate
                    ? new Date(editRequiredByDate).toISOString()
                    : null,
                };
                if (first?.materialId || first?.material?.id) {
                  payload.items = [
                    {
                      materialId: first.materialId || first.material?.id,
                      unit: editUnit,
                      quantityRequested: editQty,
                    },
                  ];
                }
                saveIndent.mutate(payload);
              }}
            >
              {saveIndent.isPending ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </Card>
      ) : (
      <Card className="mb-3">
        <DetailFieldGrid>
          {(request.project?.name || request.project?.code) && (
            <DetailField label="Project" labelClassName="text-gray-500">
              {formatProjectLabel(request.project)}
            </DetailField>
          )}
          {(request.requestedByName || request.requester?.name) && (
            <DetailField label="Requested by" labelClassName="text-gray-500">
              {request.requestedByName || request.requester?.name}
            </DetailField>
          )}
          {request.indentCategory?.name && (
            <DetailField label="Indent category" labelClassName="text-gray-500">
              {request.indentCategory.name}
            </DetailField>
          )}
          {request.site && (
            <DetailField label="Site" labelClassName="text-gray-500">
              {request.site.name}
              {request.site.chainageLabel ? ` · ${request.site.chainageLabel}` : ''}
            </DetailField>
          )}
          {request.indentRequestType && (
            <DetailField label="Indent type" labelClassName="text-gray-500">
              {INDENT_REQUEST_TYPE_LABELS[request.indentRequestType]}
            </DetailField>
          )}
          {!hidePricing && request.estimatedValue != null && request.estimatedValue > 0 && (
            <DetailField label="Estimated value" labelClassName="text-gray-500">
              {formatCurrency(request.estimatedValue)}
            </DetailField>
          )}
          {request.purpose && (
            <DetailField label="Reason for request" fullWidth labelClassName="text-gray-500" valueClassName="font-normal">
              {request.purpose}
            </DetailField>
          )}
        </DetailFieldGrid>
      </Card>
      )}

      <Card className="mb-3 overflow-hidden p-0">
        <div className="px-4 py-3 border-b border-surface-border">
          <h2 className="font-semibold text-gray-900">Indent line items</h2>
          <p className="text-xs text-ink-secondary mt-1">
            {showAvailableToIssue
              ? 'GRN receipts, issues, available stock, and pending receipts are tracked per product line.'
              : 'GRN receipts, issues, and pending receipts are tracked per product line.'}
          </p>
        </div>
        <div className="table-shell">
          <table className="data-table min-w-[56rem]">
            <thead>
              <tr>
                <th>Item</th>
                <th>Location</th>
                <th>Required by</th>
                <th className="num">Requested</th>
                <th className="num">GRN received</th>
                <th className="num">Issued</th>
                {showAvailableToIssue && (
                  <th className="num">Available to issue</th>
                )}
                <th className="num">Pending receipt</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td className="cell-text">{item.material?.name || 'Material'}</td>
                  <td className="cell-text">{item.location || '—'}</td>
                  <td className="whitespace-nowrap">
                    {item.requiredByDate ? formatDate(item.requiredByDate) : '—'}
                  </td>
                  <td className="num tabular-nums">
                    {item.quantityRequested} {item.unit || item.material?.unit || ''}
                  </td>
                  <td className="num tabular-nums">
                    {item.quantityReceived ?? 0} {item.unit || item.material?.unit || ''}
                  </td>
                  <td className="num tabular-nums">
                    {item.quantityIssued ?? 0} {item.unit || item.material?.unit || ''}
                  </td>
                  {showAvailableToIssue && (
                    <td
                      className={`num tabular-nums font-semibold ${
                        (item.availableQty ?? 0) >= (item.quantityRequested ?? 0)
                          ? 'text-emerald-700'
                          : 'text-warning-dark'
                      }`}
                    >
                      {item.availableQty ?? 0} {item.unit || item.material?.unit || ''}
                    </td>
                  )}
                  <td className="num tabular-nums">
                    {item.pendingReceiptQty ?? 0} {item.unit || item.material?.unit || ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="mb-3 overflow-hidden p-0">
        <div className="px-4 py-3 border-b border-surface-border">
          <h2 className="font-semibold text-gray-900">GRN and invoice details</h2>
          <p className="text-xs text-ink-secondary mt-1">
            Complete receipt traceability for this indent.
          </p>
        </div>
        {request.grns?.length ? (
          <div className="divide-y divide-surface-border">
            {request.grns.map((grn) => (
              <div key={grn.id} className="p-4 space-y-3">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <DetailField label="GRN number">{grn.grnNumber}</DetailField>
                  <DetailField label="Received on">{formatDate(grn.receivedAt)}</DetailField>
                  <DetailField label="GRN status">
                    {grn.status.replace(/_/g, ' ')}
                  </DetailField>
                  <DetailField label="PO number">{grn.poNumber || '—'}</DetailField>
                  <DetailField label="Vendor">{grn.vendorName || '—'}</DetailField>
                  <DetailField label="Invoice number">
                    {grn.invoiceNumber || '—'}
                  </DetailField>
                  <DetailField label="Invoice date">
                    {grn.invoiceDate ? formatDate(grn.invoiceDate) : '—'}
                  </DetailField>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-1">Products received</p>
                  <div className="rounded-lg border border-surface-border divide-y divide-surface-border">
                    {grn.items.map((item) => (
                      <div
                        key={`${grn.id}-${item.materialId}`}
                        className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                      >
                        <span className="text-gray-900">{item.materialName}</span>
                        <span className="font-medium tabular-nums">
                          {formatQuantity(item.quantityReceived, item.unit)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="px-4 py-5 text-sm text-ink-muted">
            No GRN or invoice has been recorded for this indent yet.
          </p>
        )}
      </Card>

      <h2 className="font-semibold text-gray-900 mb-3">Stock comparison (requesting site)</h2>
      <StockComparisonTable
        items={items}
        className="mb-3"
        showPricing={!hidePricing}
        showFulfillment
        showAvailableToIssue={showAvailableToIssue}
        totalEstimatedValue={hidePricing ? undefined : request.estimatedValue}
      />

      {role === UserRole.PROJECT_MANAGER &&
      request.crossProjectStock?.some((row) =>
        row.projects?.some((p) => p.projectId !== request.projectId)
      ) ? (
        <>
          <h2 className="font-semibold text-gray-900 mb-3">Stock at other projects</h2>
          <p className="text-xs text-ink-secondary mb-3">
            {showBranchTransfer
              ? 'Enter how many to take from each site (up to available). You can take from more than one project. Any leftover still goes to Head Office.'
              : 'Live stock on your other assigned projects and their sites — not this indent\u2019s project.'}
          </p>
          <CrossProjectStockPanel
            rows={request.crossProjectStock}
            requestingProjectId={request.projectId}
            takeQtyByKey={takeQtyByKey}
            onChangeTake={
              showBranchTransfer
                ? (materialId, source, qty) => {
                    setTakeQtyByKey((prev) => ({
                      ...prev,
                      [takeKey(materialId, source.siteId)]: qty,
                    }));
                  }
                : undefined
            }
            requestedByMaterial={requestedByMaterial}
            alreadyCoveredByMaterial={alreadyCoveredByMaterial}
            lockedSiteIds={lockedSiteIds}
            className="mb-3"
          />
        </>
      ) : null}

      {role === UserRole.PROJECT_MANAGER && (
        <StockAcrossProjectsDropdown excludeProjectId={request.projectId} className="mb-3" />
      )}

      {role === UserRole.PROJECT_MANAGER && (request.linkedBranchTransfers?.length || 0) > 0 ? (
        <Card className="mb-3 p-4 space-y-2">
          <p className="text-sm font-semibold text-ink">Branch transfers on this indent</p>
          <ul className="space-y-2">
            {request.linkedBranchTransfers!.map((t) => (
              <li key={t.id}>
                <Link
                  to={`/branch-transfers/${t.id}`}
                  className="flex items-start justify-between gap-3 rounded-xl border border-surface-border px-3 py-2 text-sm hover:bg-surface-muted/50"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-ink">{t.transferNumber}</p>
                    <p className="text-xs text-ink-secondary">
                      {[t.fromProjectName, t.fromSite].filter(Boolean).join(' · ') || 'Source site'}
                      {t.items?.length
                        ? ` · ${t.items.map((item) => `${item.quantity} ${item.materialName || ''}`.trim()).join(', ')}`
                        : ''}
                    </p>
                  </div>
                  <span className="text-xs font-medium text-ink-muted shrink-0">
                    {t.status.replace(/_/g, ' ')}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {canCoordinatorLocalClose && (
        <div className="mb-3 panel p-3">
          <p className="text-sm font-semibold text-ink">Coordinator decision</p>
          <p className="text-xs text-ink-secondary mt-1">
            {coordinatorCanCloseWithinCap
              ? 'Can locally approve and close. No need to reach out to MD/Coordinator level.'
              : 'This indent exceeds the remaining Coordinator daily cap — it will escalate to MD / Chairman.'}
          </p>
          <div className="mt-3">
            <label className="text-sm font-medium text-ink-secondary block mb-2">
              Remark <span className="text-danger">*</span>
            </label>
            <Textarea
              value={pmRemark}
              onChange={(e) => {
                setPmRemark(e.target.value);
                if (e.target.value.trim()) setPmRemarkError('');
              }}
              placeholder="Decision rationale — visible in audit trail…"
            />
            {pmRemarkError && <p className="text-xs text-danger mt-1">{pmRemarkError}</p>}
          </div>
          <Button
            className="mt-3"
            variant="accent"
            accentColor={ROLE_COLORS[UserRole.COORDINATOR].primary}
            disabled={coordinatorLocalClose.isPending}
            onClick={() => {
              if (!requirePmRemark()) return;
              coordinatorLocalClose.mutate(pmRemark.trim());
            }}
          >
            {coordinatorCanCloseWithinCap
              ? stockAvailable
                ? 'Approve & close at Coordinator'
                : 'Approve at Coordinator (no MD)'
              : 'Escalate to MD / Chairman'}
          </Button>
        </div>
      )}

      {showProceedAllocationPanel && (
        <div className="mb-3 panel p-3">
          <p className="text-sm font-semibold text-ink">Proceed with Allocation</p>
          <p className="text-xs text-ink-secondary mt-1">
            {canClickProceedAllocation
              ? proceedAllocationHint
              : `Waiting for ${allocationOwnerLabel} to proceed with allocation.`}
          </p>
          <div className="mt-3">
            <label className="text-sm font-medium text-ink-secondary block mb-2">
              Remark <span className="text-danger">*</span>
            </label>
            <Textarea
              value={pmRemark}
              onChange={(e) => {
                setPmRemark(e.target.value);
                if (e.target.value.trim()) setPmRemarkError('');
              }}
              placeholder="Remark for Proceed with Allocation…"
              disabled={!canClickProceedAllocation}
            />
            {pmRemarkError && <p className="text-xs text-danger mt-1">{pmRemarkError}</p>}
          </div>
          <Button
            className="mt-3"
            variant="accent"
            accentColor={ROLE_COLORS[role]?.primary || accent}
            disabled={!canClickProceedAllocation || proceedAllocation.isPending}
            onClick={() => {
              if (!canClickProceedAllocation) return;
              if (!requirePmRemark()) return;
              proceedAllocation.mutate(pmRemark.trim());
            }}
          >
            Proceed with Allocation
          </Button>
        </div>
      )}

      {showPmDecisionPanel && (
        <div className="mb-3 panel p-3">
          <div className="grid gap-3 lg:grid-cols-2">
            <div>
              <p className="text-sm font-semibold text-ink">PM decision</p>
              {exceedsPmApprovalLevel ? (
                <>
                  <p className="text-xs text-ink-secondary mt-1">
                    {PM_ABOVE_APPROVAL_LEVEL_MESSAGE}
                  </p>
                  <p className="text-xs text-ink-muted mt-1">
                    {stockAvailable
                      ? 'Stock is available at site.'
                      : showBranchTransfer
                        ? `This site is short. Take qty from one or more assigned projects (currently ${totalTaking} of ${remainingAfterExisting}). Remaining ${remainingAfterTakes} can still go to Head Office.`
                        : remainingAfterExisting > 0
                          ? `${remainingAfterExisting} still needed after branch transfers.`
                          : 'Stock is short at site.'}
                  </p>
                </>
              ) : (
                <p className="text-xs text-ink-secondary mt-1">
                  {isBelowCap
                    ? stockAvailable
                      ? 'Below ₹5,000 and stock is available — Approve to close at PM and reserve stock for Store to issue.'
                      : showBranchTransfer
                        ? `Below ₹5,000 and this site is short. Take from other projects (currently ${totalTaking} of ${remainingAfterExisting}), then forward the remaining ${remainingAfterTakes} to Head Office if needed.`
                        : remainingAfterExisting > 0
                          ? `Below ₹5,000 — ${remainingAfterExisting} still needed. Forward remaining to Head Office for procurement.`
                          : 'Below ₹5,000 and stock is short — Forward to Head Office for procurement.'
                    : stockAvailable
                      ? wouldExceedPmCap
                        ? `Your ₹${(pmDailyCap?.dailyCap ?? 5000).toLocaleString('en-IN')}/day approval cap is reached — this indent must go to Head Office.`
                        : 'Stock is available at site — Approve to close at PM and reserve allocation so Store can issue.'
                      : showBranchTransfer
                        ? `This site is short. Take qty from one or more assigned projects (currently ${totalTaking} of ${remainingAfterExisting}). Remaining ${remainingAfterTakes} can still go to Head Office.`
                        : remainingAfterExisting > 0
                          ? `${remainingAfterExisting} still needed after branch transfers. Forward remaining to Head Office for stock requisition.`
                          : 'Stock is short at site. Forward to Head Office for stock requisition / procurement.'}
                </p>
              )}
              {showBranchTransfer && totalRequested > 0 ? (
                <p className="mt-2 text-xs font-medium tabular-nums text-ink">
                  Taking {totalAlready + totalTaking} of {totalRequested}
                  {remainingAfterTakes > 0
                    ? ` · Remaining ${remainingAfterTakes} for HO`
                    : ' · Fully covered by transfers'}
                </p>
              ) : null}

              <div className="mt-3">
                <label className="text-sm font-medium text-ink-secondary block mb-2">
                  Remark <span className="text-danger">*</span>
                </label>
                <Textarea
                  value={pmRemark}
                  onChange={(e) => {
                    setPmRemark(e.target.value);
                    if (e.target.value.trim()) setPmRemarkError('');
                  }}
                  placeholder={
                    totalTaking > 0
                      ? 'Why take this stock from the selected project sites…'
                      : exceedsPmApprovalLevel
                        ? 'Reason for forwarding to Head Office for further approval…'
                        : showForwardToHo
                          ? remainingAfterExisting < totalRequested
                            ? 'Reason for remaining stock requisition to Head Office…'
                            : 'Reason for stock requisition to Head Office…'
                          : 'Decision rationale — visible in audit trail to all approvers…'
                  }
                />
                {pmRemarkError && <p className="text-xs text-danger mt-1">{pmRemarkError}</p>}
              </div>
            </div>

            <div className="flex flex-col justify-end gap-2">
              {showPmApprove && (
                <Button
                  variant="accent"
                  accentColor={accent}
                  disabled={
                    pmLocalClose.isPending ||
                    forwardToHo.isPending ||
                    requestBranchTransfers.isPending
                  }
                  onClick={() => {
                    if (!requirePmRemark()) return;
                    pmLocalClose.mutate(pmRemark.trim());
                  }}
                >
                  {pmApproveClosesAtPm ? 'Approve & close at PM' : 'Approve'}
                </Button>
              )}
              {showBranchTransfer && (
                <Button
                  variant="accent"
                  accentColor={accent}
                  disabled={
                    requestBranchTransfers.isPending ||
                    forwardToHo.isPending ||
                    pmLocalClose.isPending ||
                    totalTaking <= 0
                  }
                  onClick={() => {
                    if (!requirePmRemark()) return;
                    const sources = buildBatchSources(
                      takeQtyByKey,
                      otherProjectSitesWithStock(
                        request.crossProjectStock || [],
                        request.projectId
                      )
                    );
                    if (!sources.length) {
                      toast.error('Enter a take quantity on at least one source site');
                      return;
                    }
                    requestBranchTransfers.mutate({
                      materialRequestId: request.id,
                      note: pmRemark.trim(),
                      sources,
                    });
                  }}
                >
                  {requestBranchTransfers.isPending
                    ? 'Requesting…'
                    : totalTaking > 0
                      ? `Request branch transfer for ${totalTaking}`
                      : 'Enter take qty, then request branch transfer'}
                </Button>
              )}
              {showForwardToHo && (
                <Button
                  variant={showBranchTransfer ? 'secondary' : 'accent'}
                  accentColor={accent}
                  disabled={
                    forwardToHo.isPending ||
                    pmLocalClose.isPending ||
                    requestBranchTransfers.isPending
                  }
                  onClick={() => {
                    if (!requirePmRemark()) return;
                    forwardToHo.mutate(pmRemark.trim());
                  }}
                >
                  {exceedsPmApprovalLevel
                    ? 'Forward to HO for further approval'
                    : remainingAfterExisting < totalRequested
                      ? `Forward remaining ${remainingAfterTakes} to HO`
                      : 'Forward to HO for Stock Procurement'}
                </Button>
              )}
              {totalTaking > 0 && remainingAfterTakes > 0 ? (
                <p className="text-[11px] text-ink-muted">
                  Request the selected takes first. Remaining {remainingAfterTakes} can then be forwarded to Head Office.
                </p>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {showProcurementTrace && (
        <div className="mb-3 space-y-3 panel p-3">
          <p className="text-sm font-semibold text-ink">Procurement progress</p>
          <div className="space-y-1.5 text-sm text-ink-secondary">
            <p>
              PR:{' '}
              <span className="font-medium text-ink">
                {request.prNumber || (request.purchaseRequestId ? 'Created' : 'Not created')}
              </span>
            </p>
            <p>
              RFQ:{' '}
              <span className="font-medium text-ink">
                {request.rfqNumber
                  ? `${request.rfqNumber}${
                      request.rfqStatus
                        ? ` · ${
                            request.rfqStatus === 'OPEN'
                              ? 'awaiting quotes'
                              : request.rfqStatus === 'FINALIZED'
                                ? request.poId
                                  ? 'finalized (PO created)'
                                  : 'finalized — ready for PO'
                                : request.rfqStatus.replace(/_/g, ' ')
                          }`
                        : ''
                    }`
                  : 'Not started'}
              </span>
            </p>
            <p>
              PO:{' '}
              <span className="font-medium text-ink">
                {request.poNumber
                  ? `${request.poNumber}${
                      request.poStatus ? ` · ${request.poStatus.replace(/_/g, ' ')}` : ''
                    }`
                  : 'Not created'}
              </span>
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {awaitingDecision && (
              <Button
                variant="accent"
                accentColor={ROLE_COLORS[UserRole.EXECUTIVE].primary}
                onClick={() =>
                  navigate(
                    role === UserRole.COORDINATOR
                      ? `/coordinator/procurement-decisions/${request.id}`
                      : `/executive/procurement-decisions/${request.id}`
                  )
                }
              >
                Review & decide
              </Button>
            )}
            {request.purchaseRequestId &&
              role === UserRole.EXECUTIVE &&
              (!request.rfqId || request.rfqStatus === 'OPEN') && (
              <Button
                variant="primary"
                onClick={() =>
                  navigate(
                    `/executive/rfq/new?purchaseRequestId=${request.purchaseRequestId}`
                  )
                }
              >
                Create RFQ
              </Button>
            )}
            {request.rfqId && request.rfqStatus !== 'OPEN' && (
              <Button variant="secondary" onClick={() => navigate(`/rfqs/${request.rfqId}`)}>
                Open RFQ
              </Button>
            )}
            {request.rfqId &&
              request.rfqStatus === 'FINALIZED' &&
              !request.poId &&
              request.purchaseRequestId &&
              role === UserRole.EXECUTIVE && (
                <Button
                  variant="primary"
                  onClick={() =>
                    navigate(
                      `/executive/po/new?purchaseRequestId=${request.purchaseRequestId}`
                    )
                  }
                >
                  Create PO
                </Button>
              )}
            {request.poId && (
              <Button
                variant="secondary"
                onClick={() => navigate(`/purchase-orders/${request.poId}`)}
              >
                View PO
              </Button>
            )}
            {request.status === 'EXECUTIVE_DECISION_BRANCH_TRANSFER' && (
              <Button
                variant="secondary"
                onClick={() =>
                  navigate(
                    role === UserRole.COORDINATOR
                      ? `/coordinator/procurement-decisions/${request.id}`
                      : `/executive/procurement-decisions/${request.id}`
                  )
                }
              >
                View branch transfer
              </Button>
            )}
          </div>
        </div>
      )}

      {canConfirmReceipt && (
        <div className="flex flex-wrap gap-2 mb-3">
          <Button
            variant="accent"
            accentColor={ROLE_COLORS[UserRole.SITE_INCHARGE].primary}
            disabled={confirmReceipt.isPending}
            onClick={() => confirmReceipt.mutate()}
          >
            Collect & verify stock
          </Button>
        </div>
      )}

      <h2 className="font-semibold text-gray-900 mb-3">Status timeline</h2>
      <StatusTimeline entityType="MaterialRequest" entityId={request.id} />
    </div>
  );
}
