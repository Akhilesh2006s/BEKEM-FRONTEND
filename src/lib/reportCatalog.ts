import { UserRole } from '@afios/shared';

export type ReportCategory =
  | 'inventory'
  | 'procurement'
  | 'project'
  | 'vendor'
  | 'finance'
  | 'mis'
  | 'compliance';

export type ReportStatus = 'live' | 'planned';

export interface ReportDefinition {
  id: string;
  title: string;
  description: string;
  category: ReportCategory;
  /** Absolute app path (existing page or new report route). */
  href: string;
  roles: UserRole[];
  status: ReportStatus;
}

const ALL_OPS: UserRole[] = [
  UserRole.STORE_INCHARGE,
  UserRole.PROJECT_MANAGER,
  UserRole.EXECUTIVE,
  UserRole.COORDINATOR,
  UserRole.CHAIRMAN,
];

/** SAP-style MIS catalog — live entries navigate; planned show as Coming soon. */
export const REPORT_CATALOG: ReportDefinition[] = [
  // —— Existing surfaces ——
  {
    id: 'live-stock',
    title: 'Live stock balance',
    description: 'On-hand, reserved, and available quantity by material and site.',
    category: 'inventory',
    href: '/store/stock',
    roles: ALL_OPS,
    status: 'live',
  },
  {
    id: 'inward-register',
    title: 'Inward register',
    description: 'GRN inward register — receipts by invoice, vendor, and line qty.',
    category: 'inventory',
    href: '/store/registers?tab=inward',
    roles: [UserRole.STORE_INCHARGE, UserRole.COORDINATOR, UserRole.CHAIRMAN],
    status: 'live',
  },
  {
    id: 'outward-register',
    title: 'Outward / issue register',
    description: 'Material issue outward register — issues to site by indent and line.',
    category: 'inventory',
    href: '/store/registers?tab=outward',
    roles: [UserRole.STORE_INCHARGE, UserRole.COORDINATOR, UserRole.CHAIRMAN],
    status: 'live',
  },
  {
    id: 'stock-aging',
    title: 'Stock aging',
    description: 'Slow-moving stock by age buckets.',
    category: 'inventory',
    href: '/store/stock-aging',
    roles: [
      UserRole.STORE_INCHARGE,
      UserRole.PROJECT_MANAGER,
      UserRole.COORDINATOR,
      UserRole.CHAIRMAN,
    ],
    status: 'live',
  },
  {
    id: 'grn-list',
    title: 'Material receipt (GRN) list',
    description: 'Pending PO receipts and submitted GRNs with quantities.',
    category: 'inventory',
    href: '__ROLE__/grn',
    roles: [UserRole.STORE_INCHARGE, UserRole.COORDINATOR],
    status: 'live',
  },
  {
    id: 'finance',
    title: 'Finance & Tally',
    description: 'Bills, payments, and Tally sync status.',
    category: 'finance',
    href: '__ROLE__/finance',
    roles: ALL_OPS,
    status: 'live',
  },
  {
    id: 'monthly-finance',
    title: 'Monthly transaction report',
    description: 'Month-wise purchase and payment summary.',
    category: 'finance',
    href: '__ROLE__/finance/monthly-report',
    roles: ALL_OPS,
    status: 'live',
  },
  {
    id: 'misc-purchases',
    title: 'Misc purchases',
    description: 'Non-catalog / site expense purchases.',
    category: 'finance',
    href: '__ROLE__/misc-purchases',
    roles: [
      UserRole.PROJECT_MANAGER,
      UserRole.EXECUTIVE,
      UserRole.COORDINATOR,
      UserRole.CHAIRMAN,
    ],
    status: 'live',
  },
  {
    id: 'explorer',
    title: 'Explorer',
    description: 'Cross-project portfolio search and overview.',
    category: 'mis',
    href: '/explorer',
    roles: [
      UserRole.SITE_INCHARGE,
      UserRole.STORE_INCHARGE,
      UserRole.PROJECT_MANAGER,
      UserRole.EXECUTIVE,
      UserRole.COORDINATOR,
      UserRole.CHAIRMAN,
    ],
    status: 'live',
  },
  {
    id: 'vendors',
    title: 'Vendors master / scorecards',
    description: 'Supplier list and performance scorecards.',
    category: 'vendor',
    href: '/vendors',
    roles: [UserRole.EXECUTIVE, UserRole.COORDINATOR, UserRole.CHAIRMAN],
    status: 'live',
  },
  {
    id: 'user-analytics',
    title: 'User analytics',
    description: 'Team volume and approval workload.',
    category: 'mis',
    href: '/chairman/user-analytics',
    roles: [UserRole.CHAIRMAN],
    status: 'live',
  },
  {
    id: 'audit-log',
    title: 'Approval & audit trail',
    description: 'Who changed what — approvals, overrides, and status history.',
    category: 'compliance',
    href: '/reports/approval-trail',
    roles: [UserRole.COORDINATOR, UserRole.CHAIRMAN],
    status: 'live',
  },
  {
    id: 'category-materials',
    title: 'Materials by category',
    description: 'Catalog counts and classification.',
    category: 'inventory',
    href: '/admin/materials/category-report',
    roles: [UserRole.COORDINATOR, UserRole.CHAIRMAN],
    status: 'live',
  },
  {
    id: 'open-pos-browse',
    title: 'Purchase orders browse',
    description: 'All POs for your scope — pending, approved, completed.',
    category: 'procurement',
    href: '__ROLE__/purchase-orders',
    roles: ALL_OPS,
    status: 'live',
  },
  {
    id: 'indents-browse',
    title: 'Material indents',
    description: 'Indent queue for your role.',
    category: 'procurement',
    href: '__ROLE__/indents',
    roles: [
      UserRole.SITE_INCHARGE,
      UserRole.STORE_INCHARGE,
      UserRole.PROJECT_MANAGER,
      UserRole.EXECUTIVE,
      UserRole.COORDINATOR,
    ],
    status: 'live',
  },
  {
    id: 'branch-transfers',
    title: 'Branch transfers',
    description: 'Inter-project stock transfer requests and approvals.',
    category: 'inventory',
    href: '__ROLE__/branch-transfers',
    roles: [UserRole.PROJECT_MANAGER, UserRole.COORDINATOR, UserRole.CHAIRMAN],
    status: 'live',
  },
  {
    id: 'po-verify',
    title: 'PO verification queue',
    description: 'POs awaiting coordinator verification.',
    category: 'procurement',
    href: '/coordinator/verify-pos',
    roles: [UserRole.COORDINATOR],
    status: 'live',
  },
  {
    id: 'grn-hold',
    title: 'GRN on hold',
    description: 'Receipts with quantity or price variance awaiting approval.',
    category: 'inventory',
    href: '__ROLE__/grn-approvals',
    roles: [UserRole.COORDINATOR, UserRole.CHAIRMAN],
    status: 'live',
  },
  {
    id: 'delivery-alerts',
    title: 'Delivery overdue alerts',
    description: 'Approved POs past expected delivery.',
    category: 'procurement',
    href: '/reports/open-po?overdue=1',
    roles: [UserRole.EXECUTIVE, UserRole.COORDINATOR, UserRole.CHAIRMAN, UserRole.STORE_INCHARGE],
    status: 'live',
  },

  // —— Wave 1 new reports ——
  {
    id: 'indent-aging',
    title: 'Indent status & aging',
    description: 'Where each indent is stuck and for how many days.',
    category: 'procurement',
    href: '/reports/indent-aging',
    roles: [
      UserRole.SITE_INCHARGE,
      UserRole.STORE_INCHARGE,
      UserRole.PROJECT_MANAGER,
      UserRole.EXECUTIVE,
      UserRole.COORDINATOR,
      UserRole.CHAIRMAN,
    ],
    status: 'live',
  },
  {
    id: 'open-po',
    title: 'Open / delayed purchase orders',
    description: 'Committed buy qty still pending receipt, with overdue flag.',
    category: 'procurement',
    href: '/reports/open-po',
    roles: ALL_OPS,
    status: 'live',
  },
  {
    id: 'grn-register',
    title: 'GRN register report',
    description: 'Inbound receipts with invoice, ordered / received / left.',
    category: 'inventory',
    href: '/reports/grn-register',
    roles: [UserRole.STORE_INCHARGE, UserRole.COORDINATOR, UserRole.CHAIRMAN, UserRole.EXECUTIVE],
    status: 'live',
  },
  {
    id: 'issue-register',
    title: 'Material issue register',
    description: 'Issues to site linked to indent, with quantities.',
    category: 'inventory',
    href: '/reports/issue-register',
    roles: [
      UserRole.STORE_INCHARGE,
      UserRole.SITE_INCHARGE,
      UserRole.PROJECT_MANAGER,
      UserRole.COORDINATOR,
      UserRole.CHAIRMAN,
    ],
    status: 'live',
  },
  {
    id: 'project-material-cost',
    title: 'Project material cost summary',
    description: 'Issued value, GRN value, and open PO commitment by project.',
    category: 'project',
    href: '/reports/project-material-cost',
    roles: [
      UserRole.PROJECT_MANAGER,
      UserRole.EXECUTIVE,
      UserRole.COORDINATOR,
      UserRole.CHAIRMAN,
    ],
    status: 'live',
  },
  {
    id: 'three-way',
    title: 'PO–GRN–invoice exceptions',
    description: 'Three-way match exceptions: qty or price variance / holds.',
    category: 'procurement',
    href: '/reports/three-way',
    roles: [UserRole.COORDINATOR, UserRole.CHAIRMAN, UserRole.EXECUTIVE],
    status: 'live',
  },
  {
    id: 'ap-aging',
    title: 'Vendor AP aging',
    description: 'Outstanding bills by aging bucket (0–30 / 31–60 / 61–90 / 90+).',
    category: 'finance',
    href: '/reports/ap-aging',
    roles: [UserRole.COORDINATOR, UserRole.CHAIRMAN, UserRole.EXECUTIVE],
    status: 'live',
  },
  {
    id: 'pipeline',
    title: 'Procurement pipeline MIS',
    description: 'Demand stuck at each gate — indent → RFQ → PO → GRN → issue.',
    category: 'mis',
    href: '/reports/pipeline',
    roles: [
      UserRole.EXECUTIVE,
      UserRole.COORDINATOR,
      UserRole.CHAIRMAN,
      UserRole.PROJECT_MANAGER,
      UserRole.STORE_INCHARGE,
    ],
    status: 'live',
  },
  {
    id: 'site-consumption',
    title: 'My indent vs issued',
    description: 'Indented vs issued quantities for your site requests.',
    category: 'project',
    href: '/reports/indent-aging?mine=1',
    roles: [UserRole.SITE_INCHARGE],
    status: 'live',
  },

  // —— Wave 2 / Wave 3 ——
  {
    id: 'shortage',
    title: 'Shortage / reorder',
    description: 'Materials below threshold with open indent and open PO cover.',
    category: 'inventory',
    href: '/reports/shortage',
    roles: [UserRole.STORE_INCHARGE, UserRole.PROJECT_MANAGER, UserRole.EXECUTIVE],
    status: 'live',
  },
  {
    id: 'price-compare',
    title: 'Last purchase price compare',
    description: 'Current PO rate vs previous purchase for the same material.',
    category: 'procurement',
    href: '/reports/price-compare',
    roles: [UserRole.EXECUTIVE, UserRole.CHAIRMAN],
    status: 'live',
  },
  {
    id: 'gst-register',
    title: 'GST purchase register',
    description: 'Taxable value and tax breakup by invoice for returns.',
    category: 'finance',
    href: '/reports/gst-register',
    roles: [UserRole.COORDINATOR, UserRole.CHAIRMAN],
    status: 'live',
  },
  {
    id: 'doc-completeness',
    title: 'Document completeness',
    description: 'Missing invoice / challan / e-way / attachments blocking payment.',
    category: 'compliance',
    href: '/reports/doc-completeness',
    roles: [UserRole.COORDINATOR, UserRole.STORE_INCHARGE, UserRole.CHAIRMAN],
    status: 'live',
  },
  {
    id: 'spend-vendor',
    title: 'Spend by vendor',
    description: 'PO / GRN / paid concentration by supplier.',
    category: 'vendor',
    href: '/reports/spend-vendor',
    roles: [UserRole.CHAIRMAN, UserRole.EXECUTIVE],
    status: 'live',
  },
  {
    id: 'branch-transfer-register',
    title: 'Branch transfer register',
    description: 'Inter-project transfers with material lines and status.',
    category: 'inventory',
    href: '/reports/branch-transfer-register',
    roles: [UserRole.PROJECT_MANAGER, UserRole.COORDINATOR, UserRole.CHAIRMAN],
    status: 'live',
  },
  {
    id: 'rfq-pipeline',
    title: 'RFQ pipeline',
    description: 'Open and finalized RFQs with linked PR, indent, and PO.',
    category: 'procurement',
    href: '/reports/rfq-pipeline',
    roles: [UserRole.EXECUTIVE, UserRole.COORDINATOR, UserRole.CHAIRMAN],
    status: 'live',
  },
  {
    id: 'grn-payment-reco',
    title: 'GRN–payment reconciliation',
    description: 'GRN invoice value vs payment bill paid and outstanding.',
    category: 'finance',
    href: '/reports/grn-payment-reco',
    roles: ALL_OPS,
    status: 'live',
  },
  {
    id: 'stock-movement',
    title: 'Stock movement ledger',
    description: 'GRN inward and issue outward movements in one ledger.',
    category: 'inventory',
    href: '/reports/stock-movement',
    roles: [
      UserRole.STORE_INCHARGE,
      UserRole.PROJECT_MANAGER,
      UserRole.COORDINATOR,
      UserRole.CHAIRMAN,
    ],
    status: 'live',
  },
  {
    id: 'cancelled-procurement',
    title: 'Cancelled / rejected procurement',
    description: 'Rejected indents and rejected POs with values.',
    category: 'procurement',
    href: '/reports/cancelled-procurement',
    roles: [UserRole.EXECUTIVE, UserRole.COORDINATOR, UserRole.CHAIRMAN],
    status: 'live',
  },
  {
    id: 'wo-cost',
    title: 'Work order cost & progress',
    description: 'WO contract value, milestone progress, and material issues.',
    category: 'project',
    href: '/reports/wo-cost',
    roles: [
      UserRole.PROJECT_MANAGER,
      UserRole.EXECUTIVE,
      UserRole.COORDINATOR,
      UserRole.CHAIRMAN,
    ],
    status: 'live',
  },
];

const CATEGORY_LABELS: Record<ReportCategory, string> = {
  inventory: 'Site / Store / Inventory',
  procurement: 'Procurement',
  project: 'Project / Cost',
  vendor: 'Vendor',
  finance: 'Finance / AP',
  mis: 'Executive MIS',
  compliance: 'Compliance / Audit',
};

export function reportCategoryLabel(category: ReportCategory) {
  return CATEGORY_LABELS[category];
}

export function reportsHubPath(role: UserRole): string {
  switch (role) {
    case UserRole.SITE_INCHARGE:
      return '/site/reports';
    case UserRole.STORE_INCHARGE:
      return '/store/reports';
    case UserRole.PROJECT_MANAGER:
      return '/pm/reports';
    case UserRole.EXECUTIVE:
      return '/executive/reports';
    case UserRole.COORDINATOR:
      return '/coordinator/reports';
    case UserRole.CHAIRMAN:
      return '/chairman/reports';
    default:
      return '/site/reports';
  }
}

export function resolveReportHref(href: string, role: UserRole): string {
  if (!href.includes('__ROLE__')) return href;

  const prefix =
    role === UserRole.SITE_INCHARGE
      ? '/site'
      : role === UserRole.STORE_INCHARGE
        ? '/store'
        : role === UserRole.PROJECT_MANAGER
          ? '/pm'
          : role === UserRole.EXECUTIVE
            ? '/executive'
            : role === UserRole.COORDINATOR
              ? '/coordinator'
              : role === UserRole.CHAIRMAN
                ? '/chairman'
                : '/site';

  if (href === '__ROLE__/finance') return `${prefix}/finance`;
  if (href === '__ROLE__/finance/monthly-report') return `${prefix}/finance/monthly-report`;
  if (href === '__ROLE__/misc-purchases') return `${prefix}/misc-purchases`;
  if (href === '__ROLE__/purchase-orders') {
    if (role === UserRole.SITE_INCHARGE) return '/incidents';
    return `${prefix}/purchase-orders`;
  }
  if (href === '__ROLE__/indents') {
    if (role === UserRole.SITE_INCHARGE) return '/incidents';
    if (role === UserRole.STORE_INCHARGE) return '/store/requests';
    if (role === UserRole.PROJECT_MANAGER) return '/pm/material-indents';
    if (role === UserRole.EXECUTIVE) return '/executive/material-indents';
    if (role === UserRole.COORDINATOR) return '/coordinator/material-indents';
    return '/incidents';
  }
  if (href === '__ROLE__/branch-transfers') {
    if (role === UserRole.PROJECT_MANAGER) return '/pm/branch-transfer-requests';
    if (role === UserRole.COORDINATOR) return '/coordinator/branch-transfers';
    if (role === UserRole.CHAIRMAN) return '/chairman/branch-transfers';
    return '/explorer';
  }
  if (href === '__ROLE__/grn-approvals') {
    if (role === UserRole.COORDINATOR) return '/coordinator/grn-approvals';
    if (role === UserRole.CHAIRMAN) return '/chairman/grn-approvals';
    return '/store/grn';
  }
  if (href === '__ROLE__/grn') {
    if (role === UserRole.COORDINATOR) return '/coordinator/grn';
    return '/store/grn';
  }
  return href.replace('__ROLE__', prefix);
}

export function getReportsForRole(role: UserRole): ReportDefinition[] {
  return REPORT_CATALOG.filter((r) => r.roles.includes(role));
}

export function getReportById(id: string): ReportDefinition | undefined {
  return REPORT_CATALOG.find((r) => r.id === id);
}

export type ReportEmbedName =
  | 'finance'
  | 'monthly-finance'
  | 'explorer'
  | 'vendors'
  | 'misc-purchases'
  | 'user-analytics'
  | 'category-materials';

export type ReportViewer =
  | { type: 'grid'; configId: string; extraParams?: Record<string, string> }
  | { type: 'embed'; name: ReportEmbedName };

const GRID_ALIASES: Record<string, { configId: string; extraParams?: Record<string, string> }> = {
  'inward-register': { configId: 'grn-register' },
  'outward-register': { configId: 'issue-register' },
  'grn-list': { configId: 'grn-register' },
  'open-pos-browse': { configId: 'open-po' },
  'indents-browse': { configId: 'indent-aging' },
  'delivery-alerts': { configId: 'open-po', extraParams: { overdue: '1' } },
  'site-consumption': { configId: 'indent-aging', extraParams: { mine: '1' } },
  'branch-transfers': { configId: 'branch-transfer-register' },
  'po-verify': { configId: 'open-po' },
  'grn-hold': { configId: 'three-way' },
  'audit-log': { configId: 'approval-trail' },
};

const EMBED_IDS: Record<string, ReportEmbedName> = {
  finance: 'finance',
  'monthly-finance': 'monthly-finance',
  explorer: 'explorer',
  vendors: 'vendors',
  'misc-purchases': 'misc-purchases',
  'user-analytics': 'user-analytics',
  'category-materials': 'category-materials',
};

export function getReportViewer(id: string): ReportViewer | null {
  if (EMBED_IDS[id]) return { type: 'embed', name: EMBED_IDS[id] };
  if (GRID_ALIASES[id]) return { type: 'grid', ...GRID_ALIASES[id] };
  return { type: 'grid', configId: id };
}
