import type { MaterialRequestDto } from '@afios/shared';
import { UserRole } from '@afios/shared';
import { formatIndentQueueStatus, isInAllocationReview, resolveAllocationReviewStage } from '@/components/MaterialIndentsTable';

/** Title-side / dropdown queue filters. Labels vary by role. */
export type IndentQueueQuickFilter =
  | 'all'
  | 'material-available'
  | 'awaiting-store'
  | 'approved-store'
  | 'pm'
  | 'ho'
  | 'coordinator'
  | 'chairman'
  | 'executive';

export type IndentQueueFilterOption = {
  id: IndentQueueQuickFilter;
  label: string;
};

/**
 * Queue chips must match `formatIndentQueueStatus` labels.
 * Do not key off pendingWith alone — e.g. PM_APPROVED is often pending Store
 * (below ₹5k purchase) but the row status still reads "Approved by PM".
 */
const AWAITING_STORE_STATUSES = new Set(['PENDING_STORE', 'MATERIAL_RECEIVED']);
/** Store acted — includes indents forwarded to PM for approval. */
const APPROVED_STORE_STATUSES = new Set([
  'ALLOCATED',
  'FORWARDED_TO_PM',
  'BRANCH_TRANSFER_REQUESTED',
]);
/** PM has approved — may still be with Store (below ₹5k) or escalated to HO. */
const APPROVED_PM_STATUSES = new Set([
  'PM_APPROVED',
  'PENDING_HO',
  'PENDING_EXECUTIVE_DECISION',
]);
const COORDINATOR_STATUSES = new Set([
  'COORDINATOR_PENDING',
  'PENDING_REVIEW',
  'COORDINATOR_VERIFIED',
]);
const CHAIRMAN_STATUSES = new Set(['CHAIRMAN_PENDING']);
/** Executive desk after PM — procurement / RFQ / PO path, including Chairman-approved POs. */
const EXECUTIVE_STATUSES = new Set([
  'PURCHASE_REQUESTED',
  'RFQ_OPEN',
  'QUOTED',
  'VENDOR_SELECTED',
  'PO_CREATED',
  'CHAIRMAN_APPROVED',
  'EXECUTIVE_DECISION_PO',
  'EXECUTIVE_DECISION_BRANCH_TRANSFER',
]);
/** Broad HO bucket for legacy `ho` filter. */
const HO_STATUSES = new Set([
  ...EXECUTIVE_STATUSES,
  ...COORDINATOR_STATUSES,
  ...CHAIRMAN_STATUSES,
  'PENDING_HO',
  'PENDING_EXECUTIVE_DECISION',
]);

/** Shared pending-queue chips — one per status color, with counts on every role. */
const ALL_PENDING_QUEUE_CHIPS: IndentQueueFilterOption[] = [
  { id: 'all', label: 'All' },
  { id: 'material-available', label: 'Material available' },
  { id: 'awaiting-store', label: 'Awaiting Store Incharge' },
  { id: 'approved-store', label: 'Approved by Store Incharge' },
  { id: 'pm', label: 'Approved by PM' },
  { id: 'executive', label: 'Approved by Executive' },
  { id: 'coordinator', label: 'Approved by Coordinator' },
  { id: 'chairman', label: 'Approved by MD/Chairman' },
];

/** Role-specific quick tabs next to the Material Indents / Pending Indents title. */
export function getIndentQueueFiltersForRole(role: UserRole): IndentQueueFilterOption[] {
  switch (role) {
    case UserRole.SITE_INCHARGE:
      return ALL_PENDING_QUEUE_CHIPS;
    case UserRole.STORE_INCHARGE:
    case UserRole.PROJECT_MANAGER:
    case UserRole.EXECUTIVE:
    case UserRole.COORDINATOR:
    case UserRole.CHAIRMAN:
      return ALL_PENDING_QUEUE_CHIPS;
    default:
      return ALL_PENDING_QUEUE_CHIPS;
  }
}

export function matchesIndentQueueQuickFilter(
  request: MaterialRequestDto,
  filter: IndentQueueQuickFilter | ''
): boolean {
  if (!filter || filter === 'all') return true;
  const status = request.status;

  if (filter === 'material-available') {
    return (request.items || []).some((item) => Number(item.availableToIssueQty || 0) > 0);
  }
  if (filter === 'awaiting-store') {
    if (resolveAllocationReviewStage(request) === 'STORE_INCHARGE') return true;
    return AWAITING_STORE_STATUSES.has(status) && !isInAllocationReview(request);
  }
  if (filter === 'approved-store') {
    if (status === 'ALLOCATED' && request.allocatedByRole && request.allocatedByRole !== 'STORE_INCHARGE') {
      return false;
    }
    return APPROVED_STORE_STATUSES.has(status) && !isInAllocationReview(request);
  }
  if (filter === 'pm') {
    if (resolveAllocationReviewStage(request) === 'PROJECT_MANAGER') return true;
    if (status === 'ALLOCATED' && request.allocatedByRole === 'PROJECT_MANAGER') return true;
    return APPROVED_PM_STATUSES.has(status) && !isInAllocationReview(request);
  }
  if (filter === 'executive') {
    const stage = resolveAllocationReviewStage(request);
    if (stage === 'EXECUTIVE') return true;
    if (stage === 'PROJECT_MANAGER' || stage === 'STORE_INCHARGE' || stage === 'SITE_INCHARGE') {
      return false;
    }
    return EXECUTIVE_STATUSES.has(status);
  }
  if (filter === 'coordinator') {
    if (status === 'ALLOCATED' && request.allocatedByRole === 'COORDINATOR') return true;
    return COORDINATOR_STATUSES.has(status);
  }
  if (filter === 'chairman') {
    return CHAIRMAN_STATUSES.has(status);
  }
  // Broad Head Office bucket (Executive + Coordinator + Chairman workflows)
  return HO_STATUSES.has(status);
}

export type IndentDaysFilter = '' | '7' | '30' | '90';

export function matchesIndentDaysFilter(request: MaterialRequestDto, days: IndentDaysFilter): boolean {
  if (!days) return true;
  const created = new Date(request.createdAt).getTime();
  if (!Number.isFinite(created)) return true;
  const cutoff = Date.now() - Number(days) * 24 * 60 * 60 * 1000;
  return created >= cutoff;
}

/** Free-text match across indent no, raised by, category, status, purpose, date. */
export function matchesIndentSearch(request: MaterialRequestDto, rawQuery: string): boolean {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return true;

  const statusLabel = formatIndentQueueStatus(
    request.status,
    request.pendingWith,
    request.approverNames,
    request.poStatus,
    request.pmProceededAllocation,
    request.allocationReviewStage,
    request.allocatedByRole
  );
  const haystack = [
    request.indentNumber,
    request.requestedByName,
    request.requester?.name,
    request.indentCategory?.name,
    request.project?.name,
    request.project?.code,
    request.purpose,
    request.status,
    statusLabel,
    request.createdAt,
    new Date(request.createdAt).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return haystack.includes(q);
}

export function filterMaterialIndents(
  requests: MaterialRequestDto[],
  opts: {
    search?: string;
    queue?: IndentQueueQuickFilter | '';
    category?: string;
    days?: IndentDaysFilter;
  }
): MaterialRequestDto[] {
  const search = opts.search ?? '';
  const queue = opts.queue ?? '';
  const category = (opts.category ?? '').trim().toLowerCase();
  const days = opts.days ?? '';

  return requests.filter((r) => {
    if (!matchesIndentSearch(r, search)) return false;
    if (!matchesIndentQueueQuickFilter(r, queue)) return false;
    if (!matchesIndentDaysFilter(r, days)) return false;
    if (category) {
      const cat = (r.indentCategory?.name || '').toLowerCase();
      if (cat !== category) return false;
    }
    return true;
  });
}

export function uniqueIndentCategories(requests: MaterialRequestDto[]): string[] {
  const set = new Set<string>();
  for (const r of requests) {
    const name = r.indentCategory?.name?.trim();
    if (name) set.add(name);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

export function isIndentQueueFilterId(value: string): value is IndentQueueQuickFilter {
  return [
    'all',
    'material-available',
    'awaiting-store',
    'approved-store',
    'pm',
    'ho',
    'coordinator',
    'chairman',
    'executive',
  ].includes(value);
}

/** Count indents matching each quick-queue chip (for badges). */
export function countIndentQueueFilters(
  requests: MaterialRequestDto[],
  options: IndentQueueFilterOption[]
): Partial<Record<IndentQueueQuickFilter, number>> {
  const counts: Partial<Record<IndentQueueQuickFilter, number>> = {};
  for (const opt of options) {
    counts[opt.id] = requests.reduce(
      (n, r) => n + (matchesIndentQueueQuickFilter(r, opt.id) ? 1 : 0),
      0
    );
  }
  return counts;
}
