import { cn } from '@/lib/utils';

/** Enterprise semantic chips: Pending=Orange, Approved=Green, Rejected=Red, Review=Blue */
const PENDING = 'bg-warning-light text-warning-dark border-warning/25';
const APPROVED = 'bg-success-light text-success-dark border-success/25';
const REJECTED = 'bg-danger-light text-danger-dark border-danger/25';
const REVIEW = 'bg-review-light text-review-dark border-review/25';
const NEUTRAL = 'bg-surface-muted text-ink-secondary border-surface-border';

const PENDING_DOT = 'bg-warning';
const APPROVED_DOT = 'bg-success';
const REJECTED_DOT = 'bg-danger';
const REVIEW_DOT = 'bg-review';
const NEUTRAL_DOT = 'bg-ink-muted';

const STATUS_STYLES: Record<string, string> = {
  PENDING_STORE: PENDING,
  PENDING_HO: PENDING,
  PENDING_EXECUTIVE_DECISION: PENDING,
  HO_PENDING_COORDINATOR: PENDING,
  EXECUTIVE_DECISION_PO: REVIEW,
  EXECUTIVE_DECISION_BRANCH_TRANSFER: REVIEW,
  PENDING_REVIEW: REVIEW,
  PENDING_APPROVAL: PENDING,
  PENDING_ACCEPTANCE: PENDING,
  PENDING: PENDING,
  PENDING_PM: PENDING,
  PENDING_DESTINATION_PM: PENDING,
  PENDING_SOURCE_FINAL: PENDING,
  REQUESTED: PENDING,
  EXECUTIVE_APPROVED: REVIEW,
  DISPATCHED: REVIEW,
  PARTIALLY_RECEIVED: REVIEW,
  ON_HOLD: PENDING,
  OPEN: PENDING,
  PO_CREATED: REVIEW,
  RAISE_PO_INSTEAD: PENDING,
  COORDINATOR_PENDING: REVIEW,
  PM_PENDING: PENDING,
  CHAIRMAN_PENDING: PENDING,
  EXECUTIVE_PENDING: REVIEW,
  IN_REVIEW: REVIEW,
  ALLOCATED: REVIEW,
  FORWARDED_TO_PM: REVIEW,
  BRANCH_TRANSFER_REQUESTED: REVIEW,
  PURCHASE_REQUESTED: REVIEW,
  IN_PROGRESS: REVIEW,
  RUNNING: REVIEW,
  ISSUED: REVIEW,
  PARTIALLY_ISSUED: PENDING,
  COORDINATOR_DECIDED: REVIEW,
  PM_APPROVED: APPROVED,
  CHAIRMAN_APPROVED: APPROVED,
  APPROVED: APPROVED,
  ACCEPTED: APPROVED,
  PM_VERIFIED: APPROVED,
  MATERIAL_RECEIVED: REVIEW,
  COMPLETED: APPROVED,
  CLOSED: APPROVED,
  RECEIVED: APPROVED,
  TRANSFERRED: APPROVED,
  ACTIVE: APPROVED,
  RESOLVED: APPROVED,
  REJECTED: REJECTED,
  CANCELLED: REJECTED,
};

const STATUS_DOT: Record<string, string> = {
  PENDING_STORE: PENDING_DOT,
  PENDING_HO: PENDING_DOT,
  PENDING_EXECUTIVE_DECISION: PENDING_DOT,
  HO_PENDING_COORDINATOR: PENDING_DOT,
  EXECUTIVE_DECISION_PO: REVIEW_DOT,
  EXECUTIVE_DECISION_BRANCH_TRANSFER: REVIEW_DOT,
  PENDING_REVIEW: REVIEW_DOT,
  PENDING_APPROVAL: PENDING_DOT,
  PENDING_ACCEPTANCE: PENDING_DOT,
  PENDING: PENDING_DOT,
  PENDING_PM: PENDING_DOT,
  PENDING_DESTINATION_PM: PENDING_DOT,
  PENDING_SOURCE_FINAL: PENDING_DOT,
  REQUESTED: PENDING_DOT,
  EXECUTIVE_APPROVED: REVIEW_DOT,
  DISPATCHED: REVIEW_DOT,
  PARTIALLY_RECEIVED: REVIEW_DOT,
  ON_HOLD: PENDING_DOT,
  OPEN: PENDING_DOT,
  RAISE_PO_INSTEAD: PENDING_DOT,
  COORDINATOR_PENDING: REVIEW_DOT,
  PM_PENDING: PENDING_DOT,
  CHAIRMAN_PENDING: PENDING_DOT,
  EXECUTIVE_PENDING: REVIEW_DOT,
  IN_REVIEW: REVIEW_DOT,
  ALLOCATED: REVIEW_DOT,
  FORWARDED_TO_PM: REVIEW_DOT,
  BRANCH_TRANSFER_REQUESTED: REVIEW_DOT,
  PURCHASE_REQUESTED: REVIEW_DOT,
  PO_CREATED: REVIEW_DOT,
  IN_PROGRESS: REVIEW_DOT,
  RUNNING: REVIEW_DOT,
  ISSUED: REVIEW_DOT,
  PARTIALLY_ISSUED: PENDING_DOT,
  COORDINATOR_DECIDED: REVIEW_DOT,
  PM_APPROVED: APPROVED_DOT,
  CHAIRMAN_APPROVED: APPROVED_DOT,
  APPROVED: APPROVED_DOT,
  ACCEPTED: APPROVED_DOT,
  PM_VERIFIED: APPROVED_DOT,
  MATERIAL_RECEIVED: REVIEW_DOT,
  COMPLETED: APPROVED_DOT,
  CLOSED: APPROVED_DOT,
  RECEIVED: APPROVED_DOT,
  TRANSFERRED: APPROVED_DOT,
  ACTIVE: APPROVED_DOT,
  RESOLVED: APPROVED_DOT,
  REJECTED: REJECTED_DOT,
  CANCELLED: REJECTED_DOT,
};

/** Default labels: awaiting current approver, not blanket approved wording. */
const STATUS_LABELS: Record<string, string> = {
  PENDING_STORE: 'Awaiting Store Incharge',
  ALLOCATED: 'Approved by Store Incharge',
  FORWARDED_TO_PM: 'Approved by Store Incharge',
  BRANCH_TRANSFER_REQUESTED: 'Approved by Store Incharge',
  PENDING_HO: 'Approved by PM',
  PENDING_EXECUTIVE_DECISION: 'Approved by PM',
  EXECUTIVE_DECISION_PO: 'Approved by Executive',
  EXECUTIVE_DECISION_BRANCH_TRANSFER: 'Approved by Executive',
  PM_APPROVED: 'Approved by PM',
  PURCHASE_REQUESTED: 'Approved by Executive',
  RFQ_OPEN: 'Approved by Executive',
  QUOTED: 'Approved by Executive',
  VENDOR_SELECTED: 'Approved by Executive',
  PO_CREATED: 'Approved by Executive',
  COORDINATOR_VERIFIED: 'Approved by Coordinator',
  HO_PENDING_COORDINATOR: 'Awaiting Coordinator',
  CHAIRMAN_APPROVED: 'Approved by Executive',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
  /** PO / WO: previous step done, waiting on Chairman */
  CHAIRMAN_PENDING: 'Coordinator approved — awaiting Chairman',
  /** PO: waiting on Coordinator (Executive already created the PO) */
  COORDINATOR_PENDING: 'Awaiting Coordinator',
  PENDING_REVIEW: 'Awaiting Coordinator',
  PENDING_APPROVAL: 'Coordinator approved — awaiting Chairman',
  PENDING_ACCEPTANCE: 'Awaiting contractor',
  ACCEPTED: 'Accepted',
  IN_PROGRESS: 'In progress',
  CLOSED: 'Closed',
  RUNNING: 'Running',
  COMPLETED: 'Completed',
  PENDING: 'Pending',
  PENDING_PM: 'Awaiting PM',
  PM_VERIFIED: 'Verified',
  MATERIAL_RECEIVED: 'Received',
  ISSUED: 'Issued to site',
  PARTIALLY_ISSUED: 'Partially issued',
  APPROVED: 'Approved',
  ACTIVE: 'Active',
  ON_HOLD: 'On hold',
  OPEN: 'Open',
  IN_REVIEW: 'In review',
  RESOLVED: 'Resolved',
  PENDING_DESTINATION_PM: 'Awaiting PM',
  PENDING_SOURCE_FINAL: 'Awaiting PM',
  RECEIVED: 'Received',
  REQUESTED: 'Requested',
  EXECUTIVE_APPROVED: 'Executive approved',
  DISPATCHED: 'Dispatched',
  PARTIALLY_RECEIVED: 'Partially received',
  COORDINATOR_DECIDED: 'Ready to transfer',
  TRANSFERRED: 'Transferred',
  RAISE_PO_INSTEAD: 'Raise PO instead',
  EXECUTIVE_PENDING: 'Awaiting Executive',
  PM_PENDING: 'Awaiting Coordinator',
};

interface StatusBadgeProps {
  status: string;
  label?: string;
  className?: string;
}

export function StatusBadge({ status, label, className }: StatusBadgeProps) {
  const dot = STATUS_DOT[status] || NEUTRAL_DOT;
  const displayLabel = label ?? STATUS_LABELS[status] ?? status.replace(/_/g, ' ');

  return (
    <span
      className={cn(
        'enterprise-chip',
        STATUS_STYLES[status] || NEUTRAL,
        className
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', dot)} aria-hidden />
      {displayLabel}
    </span>
  );
}

export function getStatusLabel(status: string): string {
  return STATUS_LABELS[status] || status.replace(/_/g, ' ');
}
