import { useState, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import type { MaterialRequestDto } from '@afios/shared';
import { formatDate, formatQuantity, formatProjectLabel, ROLE_LABELS, UserRole } from '@afios/shared';
import { StatusBadge, getStatusLabel } from '@/components/ui/StatusBadge';
import { useAuthStore } from '@/stores/authStore';

function roleLabel(role: UserRole | null | undefined) {
  if (role === UserRole.SITE_INCHARGE) return 'Indent raiser';
  return role ? ROLE_LABELS[role] : '';
}

export type AllocationReviewStage =
  | 'EXECUTIVE'
  | 'PROJECT_MANAGER'
  | 'STORE_INCHARGE'
  | 'SITE_INCHARGE';

const CLOSED_FOR_ALLOCATION_REVIEW = new Set([
  'COMPLETED',
  'CLOSED',
  'REJECTED',
  'CANCELLED',
]);
const ACTIVE_ALLOCATION_STAGES = new Set<AllocationReviewStage>([
  'EXECUTIVE',
  'PROJECT_MANAGER',
  'STORE_INCHARGE',
]);

/** Infer the current owner in the post-PO allocation chain. */
export function resolveAllocationReviewStage(
  request: Pick<
    MaterialRequestDto,
    'status' | 'poStatus' | 'pmProceededAllocation' | 'allocationReviewStage'
  >
): AllocationReviewStage | null {
  if (!request || CLOSED_FOR_ALLOCATION_REVIEW.has(request.status)) return null;
  if (request.status === 'ISSUED' || request.allocationReviewStage === 'SITE_INCHARGE') {
    return 'SITE_INCHARGE';
  }
  if (
    request.allocationReviewStage &&
    ACTIVE_ALLOCATION_STAGES.has(request.allocationReviewStage as AllocationReviewStage)
  ) {
    return request.allocationReviewStage as AllocationReviewStage;
  }
  const poApproved = request.status === 'CHAIRMAN_APPROVED' || request.poStatus === 'APPROVED';
  if (!poApproved) return null;
  if (request.pmProceededAllocation) return 'STORE_INCHARGE';
  return 'EXECUTIVE';
}

/** Executive / PM / Store still need to Proceed with Allocation. */
export function isInAllocationReview(request: MaterialRequestDto): boolean {
  const stage = resolveAllocationReviewStage(request);
  return stage === 'EXECUTIVE' || stage === 'PROJECT_MANAGER' || stage === 'STORE_INCHARGE';
}

export function isCurrentAllocationOwner(
  request: MaterialRequestDto,
  role: UserRole | string | undefined
): boolean {
  return Boolean(role) && resolveAllocationReviewStage(request) === role;
}

/** True when every line has issued qty covering the requested qty. */
export function isIndentFullyIssued(request: MaterialRequestDto): boolean {
  const items =
    request.items?.length
      ? request.items
      : request.materialId || request.quantityRequested != null
        ? [
            {
              quantityRequested: request.quantityRequested || 0,
              quantityIssued: request.quantityIssued || 0,
            },
          ]
        : [];
  if (!items.length) return false;
  return items.every(
    (item) => Number(item.quantityIssued || 0) >= Number(item.quantityRequested || 0)
  );
}

/** Label for store issue queue / indent header when status is ISSUED. */
export function formatIssuedFulfillmentLabel(request: MaterialRequestDto): string {
  return isIndentFullyIssued(request) ? 'Issued to site' : 'Partially issued';
}

/** Show awaiting first, then latest approver until the next approver acts. */
export function formatIndentQueueStatus(
  status: string,
  _pendingWith?: string,
  _approverNames?: MaterialRequestDto['approverNames'],
  poStatus?: string,
  pmProceededAllocation?: boolean,
  allocationReviewStage?: MaterialRequestDto['allocationReviewStage'],
  allocatedByRole?: MaterialRequestDto['allocatedByRole']
): string {
  if (['REJECTED', 'CANCELLED', 'COMPLETED', 'CLOSED'].includes(status)) {
    return getStatusLabel(status);
  }

  const stage = resolveAllocationReviewStage({
    status,
    poStatus,
    pmProceededAllocation,
    allocationReviewStage,
  });
  if (status === 'PARTIALLY_ISSUED') {
    return 'Partially issued';
  }
  if (stage === 'SITE_INCHARGE' || status === 'ISSUED') {
    return 'Issued to site';
  }
  if (status === 'MATERIAL_RECEIVED') {
    return 'Received';
  }
  if (stage === 'STORE_INCHARGE') {
    return 'Yet to be Received';
  }
  if (stage === 'PROJECT_MANAGER') {
    return 'Awaiting at Project Manager';
  }
  if (stage === 'EXECUTIVE') {
    return `Approved by ${roleLabel(UserRole.EXECUTIVE)}`;
  }

  switch (status) {
    case 'PENDING_STORE':
      return `Awaiting ${roleLabel(UserRole.STORE_INCHARGE)}`;
    case 'ALLOCATED':
      if (allocatedByRole === UserRole.PROJECT_MANAGER) return 'Locally Approved by PM';
      if (allocatedByRole === UserRole.COORDINATOR) return 'Locally Approved by Coordinator';
      if (allocatedByRole === UserRole.EXECUTIVE) return 'Locally Approved by Executive';
      return `Approved by ${roleLabel(UserRole.STORE_INCHARGE)}`;
    case 'FORWARDED_TO_PM':
    case 'BRANCH_TRANSFER_REQUESTED':
      return `Approved by ${roleLabel(UserRole.STORE_INCHARGE)}`;
    case 'PM_APPROVED':
    case 'PENDING_HO':
    case 'PENDING_EXECUTIVE_DECISION':
      return `Approved by ${roleLabel(UserRole.PROJECT_MANAGER)}`;
    case 'PURCHASE_REQUESTED':
    case 'RFQ_OPEN':
    case 'QUOTED':
    case 'VENDOR_SELECTED':
    case 'PO_CREATED':
    case 'EXECUTIVE_DECISION_PO':
    case 'EXECUTIVE_DECISION_BRANCH_TRANSFER':
    case 'HO_PENDING_COORDINATOR':
      return `Approved by ${roleLabel(UserRole.EXECUTIVE)}`;
    case 'COORDINATOR_PENDING':
    case 'PENDING_REVIEW':
    case 'COORDINATOR_VERIFIED':
      return `Approved by ${roleLabel(UserRole.COORDINATOR)}`;
    case 'CHAIRMAN_PENDING':
      return `Approved by ${roleLabel(UserRole.COORDINATOR)}`;
    case 'MATERIAL_RECEIVED':
      return 'Received';
    case 'PARTIALLY_ISSUED':
      return 'Partially issued';
    case 'ISSUED':
      return 'Issued to site';
    default:
      return getStatusLabel(status);
  }
}

/** Current owner’s list next action is Final review; others see View indent. */
export function isIndentReadyForPmAllocation(request: MaterialRequestDto): boolean {
  return isInAllocationReview(request);
}

type IndentTableRow = {
  requestId: string;
  indentNumber: string;
  projectLabel: string;
  submittedAt: string;
  requiredBy: string;
  purpose: string;
  indentCategory: string;
  requestedByName: string;
  pendingWith?: string;
  approverNames?: MaterialRequestDto['approverNames'];
  status: string;
  statusLabel: string;
  prNumber?: string;
  rfqNumber?: string;
  rfqStatus?: string;
  poNumber?: string;
  poStatus?: string;
  fulfillment: Array<{
    materialName: string;
    requested: string;
    received: string;
    receivedOn?: string;
    issued: string;
    readyToIssue: string;
    pendingReceipt: string;
    compactSummary: string;
  }>;
};

function rfqStatusLabel(status?: string, hasPo?: boolean) {
  if (!status) return '';
  if (status === 'OPEN') return 'Open — awaiting quotes';
  if (status === 'FINALIZED') {
    return hasPo ? 'Finalized — PO created' : 'Finalized — ready for PO';
  }
  return status.replace(/_/g, ' ');
}

function toIndentRows(
  requests: MaterialRequestDto[],
  showReadyToIssue: boolean
): IndentTableRow[] {
  return requests.map((r) => ({
    requestId: r.id,
    indentNumber: r.indentNumber,
    projectLabel: formatProjectLabel(r.project),
    submittedAt: formatDate(r.createdAt),
    requiredBy:
      [
        ...new Set(
          (r.items || [])
            .map((item) => item.requiredByDate)
            .filter((date): date is string => Boolean(date))
            .map((date) => formatDate(date))
        ),
      ].join(', ') || (r.requiredByDate ? formatDate(r.requiredByDate) : '—'),
    purpose: r.purpose?.trim() || '—',
    indentCategory: r.indentCategory?.name || '—',
    requestedByName: r.requestedByName || r.requester?.name || '—',
    pendingWith: r.pendingWith,
    approverNames: r.approverNames,
    status: r.status,
    statusLabel:
      r.status === 'ISSUED' || r.status === 'PARTIALLY_ISSUED'
        ? formatIssuedFulfillmentLabel(r)
        : formatIndentQueueStatus(
            r.status,
            r.pendingWith,
            r.approverNames,
            r.poStatus,
            r.pmProceededAllocation,
            r.allocationReviewStage,
            r.allocatedByRole
          ),
    prNumber: r.prNumber,
    rfqNumber: r.rfqNumber,
    rfqStatus: r.rfqStatus,
    poNumber: r.poNumber,
    poStatus: r.poStatus,
    fulfillment: (r.items || []).map((item) => {
      const unit = item.unit || item.material?.unit || '';
      const received = Number(item.quantityReceived || 0);
      const issued = Number(item.quantityIssued || 0);
      const available = Number(item.availableToIssueQty || 0);
      const pending = Number(item.pendingReceiptQty ?? 0);
      const readyToIssue = available;
      const receiptDates = [
        ...new Set(
          (item.receipts || [])
            .map((receipt) => receipt.receivedAt)
            .filter(Boolean)
            .map((date) => formatDate(date))
        ),
      ];
      const receiptState =
        received <= 0
          ? 'Not received'
          : pending > 0
            ? 'Partial'
            : 'Fully received';
      return {
        materialName: item.material?.name || 'Material',
        requested: formatQuantity(item.quantityRequested, unit),
        received: `${formatQuantity(received, unit)} · ${receiptState}`,
        receivedOn: receiptDates.length ? receiptDates.join(', ') : undefined,
        issued: formatQuantity(issued, unit),
        readyToIssue: formatQuantity(readyToIssue, unit),
        pendingReceipt: formatQuantity(pending, unit),
        compactSummary: showReadyToIssue
          ? `${formatQuantity(received, unit)} received · ${formatQuantity(readyToIssue, unit)} ready to issue`
          : `${formatQuantity(received, unit)} received · ${formatQuantity(issued, unit)} issued`,
      };
    }),
  }));
}

export function MaterialIndentsTable({
  requests,
  onRowClick,
  renderAction,
  showProcurementTrace = false,
}: {
  requests: MaterialRequestDto[];
  onRowClick: (requestId: string) => void;
  renderAction?: (request: MaterialRequestDto) => ReactNode;
  /** Show PR / RFQ / PO numbers and RFQ status (Executive Indents workflow). */
  showProcurementTrace?: boolean;
}) {
  const role = useAuthStore((s) => s.user?.role) as UserRole | undefined;
  const showReadyToIssue = role !== UserRole.SITE_INCHARGE;
  const rows = toIndentRows(requests, showReadyToIssue);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(() => new Set());

  const toggleDetails = (requestId: string) => {
    setExpandedRows((current) => {
      const next = new Set(current);
      if (next.has(requestId)) next.delete(requestId);
      else next.add(requestId);
      return next;
    });
  };

  return (
    <div className="table-shell">
      <table className="data-table w-full">
        <thead>
          <tr>
            <th>Indent Number</th>
            <th>Project</th>
            <th>Submitted on</th>
            <th>Required by</th>
            <th>Purpose</th>
            <th>Category</th>
            <th>Raised By</th>
            {showProcurementTrace && <th>RFQ &amp; PO</th>}
            <th>Material fulfillment</th>
            <th>Status</th>
            {renderAction && <th>Next action</th>}
            <th className="w-10" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.requestId}
              className="cursor-pointer"
              onClick={() => onRowClick(row.requestId)}
            >
              <td className="font-semibold text-ink break-all">{row.indentNumber}</td>
              <td className="cell-text whitespace-nowrap">{row.projectLabel}</td>
              <td className="whitespace-nowrap">{row.submittedAt}</td>
              <td className="whitespace-nowrap">{row.requiredBy}</td>
              <td className="cell-text max-w-[16rem]">{row.purpose}</td>
              <td className="cell-text whitespace-nowrap">{row.indentCategory}</td>
              <td className="cell-text whitespace-nowrap">{row.requestedByName}</td>
              {showProcurementTrace && (
                <td className="min-w-[12rem]">
                  <div className="space-y-1 text-[11px] leading-4 text-ink-secondary">
                    {row.prNumber ? (
                      <p>
                        <span className="text-ink-muted">PR:</span>{' '}
                        <span className="font-semibold text-ink">{row.prNumber}</span>
                      </p>
                    ) : (
                      <p className="text-ink-muted">PR: not created</p>
                    )}
                    {row.rfqNumber ? (
                      <p>
                        <span className="text-ink-muted">RFQ:</span>{' '}
                        <span className="font-semibold text-ink">{row.rfqNumber}</span>
                        {row.rfqStatus ? (
                          <span className="block text-[10px] text-ink-muted mt-0.5">
                            {rfqStatusLabel(row.rfqStatus, Boolean(row.poNumber))}
                          </span>
                        ) : null}
                      </p>
                    ) : (
                      <p className="text-ink-muted">RFQ: not started</p>
                    )}
                    {row.poNumber ? (
                      <p>
                        <span className="text-ink-muted">PO:</span>{' '}
                        <span className="font-semibold text-ink">{row.poNumber}</span>
                        {row.poStatus ? (
                          <span className="block text-[10px] text-ink-muted mt-0.5">
                            {row.poStatus.replace(/_/g, ' ')}
                          </span>
                        ) : null}
                      </p>
                    ) : (
                      <p className="text-ink-muted">PO: not created</p>
                    )}
                  </div>
                </td>
              )}
              <td>
                <div className="space-y-1.5">
                  {row.fulfillment.length ? (
                    <>
                      {expandedRows.has(row.requestId) ? (
                        row.fulfillment.map((summary, index) => (
                          <div
                            key={`${row.requestId}-fulfillment-${index}`}
                            className="text-[11px] text-ink-secondary leading-4"
                          >
                            <p className="font-semibold text-ink">{summary.materialName}</p>
                            <p>
                              Requested: {summary.requested} · GRN received: {summary.received}
                              {summary.receivedOn ? ` on ${summary.receivedOn}` : ''}
                            </p>
                            <p>
                              Issued to site: {summary.issued}
                              {showReadyToIssue ? (
                                <>
                                  {' '}
                                  · Store Incharge can issue now:{' '}
                                  <span className="font-semibold text-ink">{summary.readyToIssue}</span>
                                </>
                              ) : null}
                            </p>
                            <p>Pending GRN receipt: {summary.pendingReceipt}</p>
                          </div>
                        ))
                      ) : (
                        <p className="text-[11px] text-ink-secondary truncate">
                          <span className="font-semibold text-ink">
                            {row.fulfillment[0].materialName}:
                          </span>{' '}
                          {row.fulfillment[0].compactSummary}
                          {row.fulfillment.length > 1
                            ? ` · +${row.fulfillment.length - 1} more`
                            : ''}
                        </p>
                      )}
                      <button
                        type="button"
                        className="text-[11px] font-semibold text-bekem-accent hover:underline"
                        onClick={(event) => {
                          event.stopPropagation();
                          toggleDetails(row.requestId);
                        }}
                      >
                        {expandedRows.has(row.requestId) ? 'Show less' : 'Show details'}
                      </button>
                    </>
                  ) : (
                    <span className="text-ink-muted">—</span>
                  )}
                </div>
              </td>
              <td>
                <StatusBadge
                  status={row.status}
                  label={row.statusLabel}
                />
              </td>
              {renderAction && (
                <td
                  onClick={(event) => event.stopPropagation()}
                  className="whitespace-nowrap"
                >
                  {renderAction(requests.find((request) => request.id === row.requestId)!)}
                </td>
              )}
              <td className="text-right">
                <ChevronRight className="h-4 w-4 text-ink-muted inline-block" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
